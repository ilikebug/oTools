const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createWorker } = require('tesseract.js');
const logger = require('./logger');
const { app } = require('electron'); 
const { create } = require('domain');

const execAsync = promisify(exec);

class MacTools {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'otools-screenshots');
    this.ensureTempDir();
    this.tesseractWorker = null; 
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async initialize() {
      this.tesseractWorker = await createWorker();
  }

  /**
   * Trigger Mac system region screenshot
   * @returns {Promise<Buffer>} Screenshot buffer data
   */
  async captureScreenRegion() {
    try {
      const timestamp = Date.now();
      const tempFile = path.join(this.tempDir, `screenshot-${timestamp}.png`);
      const command = `screencapture -i -x "${tempFile}"`;
      await execAsync(command);
      if (!fs.existsSync(tempFile)) {
        throw new Error('Screenshot cancelled by user');
      }
      const imageBuffer = fs.readFileSync(tempFile);
      fs.unlinkSync(tempFile);
      return imageBuffer;
    } catch (error) {
      logger.error('Screenshot failed:', error);
      throw new Error('Screenshot failed');
    }
  }

  /**
   * Use OCR to recognize text in image (optimized for packaged app)
   * @param {Buffer} imageBuffer - Image buffer data
   * @returns {Promise<string>} OCR result
   */
  async performOCR(imageBuffer) {
    try {
      const timestamp = Date.now();
      const tempFile = path.join(this.tempDir, `ocr-${timestamp}.png`);
      
      // Write image buffer to temp file
      fs.writeFileSync(tempFile, imageBuffer);
      // If primary engine fails, try the other one
      try {
        // Try Tesseract.js as fallback
        let result = await this.useTesseractJS(tempFile);
        fs.unlinkSync(tempFile);
        result = this.cleanOcrText(result);
        return result;
      } catch (fallbackError) {
        logger.error('Both OCR engines failed:', {
          primaryError: error.message,
          fallbackError: fallbackError.message
        });
        fs.unlinkSync(tempFile);
        throw new Error('OCR recognition failed - both engines failed');
      }
    } catch (error) {
      logger.error('OCR recognition failed:', error);
      throw new Error('OCR recognition failed');
    }
  }

  async useTesseractJS(imagePath) {
    try {
      const tessdataDir = this.getTessdataDir();
      await this.tesseractWorker.loadLanguage('chi_sim+eng', tessdataDir);
      await this.tesseractWorker.initialize('chi_sim+eng');
      const { data } = await this.tesseractWorker.recognize(imagePath);
      return data.text;
    } catch (error) {
      logger.error('Tesseract.js unavailable:', error);
      throw new Error('Tesseract.js unavailable');
    }
  }

  getTessdataDir() {
    if (app.isPackaged) {
      return process.resourcesPath;
    } else {
      return __dirname;
    }
  }

  /**
   * Clean up extra spaces in OCR result text
   * @param {string} text
   * @returns {string}
   */
  cleanOcrText(text) {
    return text
      // 1. Remove invisible characters and special whitespaces
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // 2. Trim spaces at the start and end of each line
      .split('\n').map(line => line.trim()).join('\n')
      // 3. Merge consecutive spaces
      .replace(/ {2,}/g, ' ')
      // 4. Merge consecutive newlines
      .replace(/\n{2,}/g, '\n')
      // 5. Remove spaces between Chinese characters
      .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
      // 6. Remove spaces between Chinese and punctuation
      .replace(/([\u4e00-\u9fa5])\s+([，。！？；：""''])/g, '$1$2')
      .replace(/([，。！？；：""''])\s+([\u4e00-\u9fa5])/g, '$1$2')
      // 7. Remove spaces between punctuation and English
      .replace(/([，。！？；：""''])\s+([a-zA-Z0-9])/g, '$1$2')
      // 8. Remove spaces between English and punctuation
      .replace(/([a-zA-Z0-9])\s+([，。！？；：""''])/g, '$1$2')
      // 9. Remove all spaces between Chinese and English (to re-add single space)
      .replace(/([\u4e00-\u9fa5])\s+([a-zA-Z0-9])/g, '$1$2')
      .replace(/([a-zA-Z0-9])\s+([\u4e00-\u9fa5])/g, '$1$2')
      // 10. Add single space between Chinese and English
      .replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2')
      .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
  }

  cleanup() {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        files.forEach(file => {
          const filePath = path.join(this.tempDir, file);
          fs.unlinkSync(filePath);
        });
      }
    } catch (error) {
      logger.error('Failed to clean up temporary files:', error);
    }
  }
}

module.exports = MacTools; 