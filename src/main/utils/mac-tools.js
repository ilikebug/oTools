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
   * Check if local Tesseract is available with multiple methods
   */
  async checkLocalTesseract() {
    if (this.localTesseractAvailable !== null) {
      return this.localTesseractAvailable;
    }
    
    try {
      // Method 1: Try 'which tesseract'
      try {
        await execAsync('which tesseract');
        this.localTesseractAvailable = true;
        return true;
      } catch (error) {
        // Continue to next method
      }

      // Method 2: Try common installation paths
      const commonPaths = [
        '/usr/local/bin/tesseract',
        '/usr/bin/tesseract',
        '/opt/homebrew/bin/tesseract',
        '/opt/local/bin/tesseract'
      ];

      for (const tesseractPath of commonPaths) {
        try {
          if (fs.existsSync(tesseractPath)) {
            // Test if it's executable
            await execAsync(`"${tesseractPath}" --version`);
            this.localTesseractAvailable = true;
            return true;
          }
        } catch (error) {
          // Continue to next path
        }
      }

      // Method 3: Try with PATH from process.env
      try {
        const { stdout } = await execAsync('echo $PATH');
        const paths = stdout.trim().split(':');
        
        for (const pathDir of paths) {
          const tesseractPath = path.join(pathDir, 'tesseract');
          try {
            if (fs.existsSync(tesseractPath)) {
              await execAsync(`"${tesseractPath}" --version`);
              this.localTesseractAvailable = true;
              return true;
            }
          } catch (error) {
            // Continue checking other paths
          }
        }
      } catch (error) {
        // Continue to next method
      }

      // Method 4: Try Homebrew specific path
      try {
        const homebrewPath = '/opt/homebrew/bin/tesseract';
        if (fs.existsSync(homebrewPath)) {
          await execAsync(`"${homebrewPath}" --version`);
          this.localTesseractAvailable = true;
          return true;
        }
      } catch (error) {
        // Continue to next method
      }

      this.localTesseractAvailable = false;
      return false;
    } catch (error) {
      logger.error('Error checking local Tesseract:', error);
      this.localTesseractAvailable = false;
      return false;
    }
  }

  /**
   * Get the path to local Tesseract executable
   */
  async getTesseractPath() {
    try {
      // Try 'which tesseract' first
      const { stdout } = await execAsync('which tesseract');
      return stdout.trim();
    } catch (error) {
      // Try common paths
      const commonPaths = [
        '/usr/local/bin/tesseract',
        '/usr/bin/tesseract',
        '/opt/homebrew/bin/tesseract',
        '/opt/local/bin/tesseract'
      ];

      for (const tesseractPath of commonPaths) {
        if (fs.existsSync(tesseractPath)) {
          try {
            await execAsync(`"${tesseractPath}" --version`);
            return tesseractPath;
          } catch (error) {
            // Continue to next path
          }
        }
      }

      throw new Error('Tesseract executable not found');
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
      
      try {
        // Check if local Tesseract is available first
        const hasLocalTesseract = await this.checkLocalTesseract();
        
        if (hasLocalTesseract) {
          // Use local Tesseract first (usually faster and more reliable in packaged apps)
          const result = await this.useLocalTesseract(tempFile);
          fs.unlinkSync(tempFile);
          return result;
        } else {
          // Fallback to Tesseract.js
          const result = await this.useTesseractJS(tempFile);
          fs.unlinkSync(tempFile);
          return result;
        }
      } catch (error) {
        // If primary engine fails, try the other one
        try {
          if (await this.checkLocalTesseract()) {
            // Try Tesseract.js as fallback
            const result = await this.useTesseractJS(tempFile);
            fs.unlinkSync(tempFile);
            return result;
          } else {
            // Try local Tesseract as fallback
            const result = await this.useLocalTesseract(tempFile);
            fs.unlinkSync(tempFile);
            return result;
          }
        } catch (fallbackError) {
          logger.error('Both OCR engines failed:', {
            primaryError: error.message,
            fallbackError: fallbackError.message
          });
          fs.unlinkSync(tempFile);
          throw new Error('OCR recognition failed - both engines failed');
        }
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

  async useLocalTesseract(imagePath) {
    try {
      // Get the tesseract path
      const tesseractPath = await this.getTesseractPath();
      
      const command = `"${tesseractPath}" "${imagePath}" stdout -l chi_sim+eng`;
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr) {
        logger.warn('Local Tesseract stderr:', stderr);
      }
      
      return stdout.trim();
    } catch (error) {
      logger.error('Local Tesseract unavailable:', error);
      throw new Error('Local Tesseract unavailable');
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