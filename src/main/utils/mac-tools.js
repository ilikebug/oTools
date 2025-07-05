const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execAsync = promisify(exec);

class MacTools {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'otools-screenshots');
    this.ensureTempDir();
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
      // Generate temp file name
      const timestamp = Date.now();
      const tempFile = path.join(this.tempDir, `screenshot-${timestamp}.png`);
      
      // Use Mac's screencapture command for region screenshot
      // -i means interactive region selection
      // -x means no shutter sound
      const command = `screencapture -i -x "${tempFile}"`;
      
      await execAsync(command);
      
      // Check if file exists
      if (!fs.existsSync(tempFile)) {
        throw new Error('Screenshot failed: User may have canceled the screenshot operation');
      }
      
      // Read file and convert to Buffer
      const imageBuffer = fs.readFileSync(tempFile);
      
      // Delete temp file
      fs.unlinkSync(tempFile);
      
      return imageBuffer;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Use OCR to recognize text in image
   * @param {Buffer} imageBuffer - Image buffer data
   * @returns {Promise<string>} OCR result
   */
  async performOCR(imageBuffer) {
    try {
      // Generate temp file
      const timestamp = Date.now();
      const tempFile = path.join(this.tempDir, `ocr-${timestamp}.png`);
      
      // Write buffer to temp file
      fs.writeFileSync(tempFile, imageBuffer);
      
      try {
        // Use local Tesseract for OCR
        const result = await this.useLocalTesseract(tempFile);
        fs.unlinkSync(tempFile);
        return result;
      } catch (tesseractError) {
        fs.unlinkSync(tempFile);
        throw new Error('OCR service is unavailable. Please ensure tesseract is installed.');
      }
    } catch (error) {
      console.error('OCR recognition failed:', error);
      throw error;
    }
  }



  /**
   * Use Tesseract for OCR
   * @param {string} imagePath - Image path
   * @returns {Promise<string>} OCR result
   */
  async useLocalTesseract(imagePath) {
    try {
      // Check if tesseract is installed
      await execAsync('which tesseract');
      
      // Use tesseract for OCR
      // -l chi_sim+eng means use Simplified Chinese and English
      const command = `tesseract "${imagePath}" stdout -l chi_sim+eng`;
      const { stdout } = await execAsync(command);
      
      return stdout.trim();
    } catch (error) {
      console.error('Local Tesseract call failed:', error);
      throw new Error('Local Tesseract not available, please install tesseract-ocr');
    }
  }

  /**
   * Clean up temporary files
   */
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
      console.error('Failed to clean up temporary files:', error);
    }
  }
}

module.exports = MacTools; 