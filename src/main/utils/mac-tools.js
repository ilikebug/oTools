const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Tesseract = require('tesseract.js');
const logger = require('./logger');

const execAsync = promisify(exec);

class MacTools {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'otools-screenshots');
    this.ensureTempDir();
    this.localTesseractAvailable = null; // Cache local Tesseract availability
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
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
        const result = await this.useTesseractJS(tempFile);
        fs.unlinkSync(tempFile);
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
      const result = await Tesseract.recognize(
        imagePath,
        'chi_sim+eng'
      );
      return result.data.text.trim();
    } catch (error) {
      logger.error('Tesseract.js unavailable:', error);
      throw new Error('Tesseract.js unavailable');
    }
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