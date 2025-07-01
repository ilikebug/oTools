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
      
      console.log('Starting region screenshot...');
      await execAsync(command);
      
      // Check if file exists
      if (!fs.existsSync(tempFile)) {
        throw new Error('Screenshot failed: User may have canceled the screenshot operation');
      }
      
      // Read file and convert to Buffer
      const imageBuffer = fs.readFileSync(tempFile);
      
      // Delete temp file
      fs.unlinkSync(tempFile);
      
      console.log('Region screenshot completed');
      return imageBuffer;
    } catch (error) {
      console.error('Region screenshot failed:', error);
      throw error;
    }
  }

  /**
   * Use Mac system's OCR to recognize text in image
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
      
      // Try Mac native OCR first, then fallback to Tesseract
      try {
        // First try using Mac system OCR (if available)
        const result = await this.useMacOCR(tempFile);
        fs.unlinkSync(tempFile);
        return result;
      } catch (macError) {
        console.log('Mac system OCR not available, trying local Tesseract');
        try {
          // Finally try using local Tesseract
          const result = await this.useLocalTesseract(tempFile);
          fs.unlinkSync(tempFile);
          return result;
        } catch (tesseractError) {
          fs.unlinkSync(tempFile);
          throw new Error('All OCR services are unavailable');
        }
      }
    } catch (error) {
      console.error('OCR recognition failed:', error);
      throw error;
    }
  }

  /**
   * Use Mac system's OCR
   * @param {string} imagePath - Image path
   * @returns {Promise<string>} OCR result
   */
  async useMacOCR(imagePath) {
    try {
      // Use Mac's vision command (if available)
      // Note: This command may not be supported on all Mac systems
      const command = `vision -i "${imagePath}" -o -`;
      const { stdout } = await execAsync(command);
      return stdout.trim();
    } catch (error) {
      throw new Error('Mac system OCR not available');
    }
  }

  /**
   * Use local Tesseract for OCR
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