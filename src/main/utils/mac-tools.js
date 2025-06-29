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
   * 触发Mac系统的区域截图功能
   * @returns {Promise<Buffer>} 截图的buffer数据
   */
  async captureScreenRegion() {
    try {
      // 生成临时文件名
      const timestamp = Date.now();
      const tempFile = path.join(this.tempDir, `screenshot-${timestamp}.png`);
      
      // 使用Mac系统的screencapture命令进行区域截图
      // -i 表示交互式选择区域
      // -x 表示不播放快门声音
      const command = `screencapture -i -x "${tempFile}"`;
      
      console.log('开始区域截图...');
      await execAsync(command);
      
      // 检查文件是否存在
      if (!fs.existsSync(tempFile)) {
        throw new Error('截图失败：用户可能取消了截图操作');
      }
      
      // 读取文件并转换为Buffer
      const imageBuffer = fs.readFileSync(tempFile);
      
      // 删除临时文件
      fs.unlinkSync(tempFile);
      
      console.log('区域截图完成');
      return imageBuffer;
    } catch (error) {
      console.error('区域截图失败:', error);
      throw error;
    }
  }

  /**
   * 使用Mac系统的OCR功能识别图片文字
   * @param {Buffer} imageBuffer - 图片buffer数据
   * @returns {Promise<string>} OCR识别结果
   */
  async performOCR(imageBuffer) {
    try {
      // 生成临时文件
      const timestamp = Date.now();
      const tempFile = path.join(this.tempDir, `ocr-${timestamp}.png`);
      
      // 将buffer写入临时文件
      fs.writeFileSync(tempFile, imageBuffer);
      
      // 先尝试Mac原生OCR，再降级到Tesseract
      try {
        // 首先尝试使用Mac系统的OCR（如果可用）
        const result = await this.useMacOCR(tempFile);
        fs.unlinkSync(tempFile);
        return result;
      } catch (macError) {
        console.log('Mac系统OCR不可用，尝试本地Tesseract');
        try {
          // 最后尝试使用本地Tesseract
          const result = await this.useLocalTesseract(tempFile);
          fs.unlinkSync(tempFile);
          return result;
        } catch (tesseractError) {
          fs.unlinkSync(tempFile);
          throw new Error('所有OCR服务都不可用');
        }
      }
    } catch (error) {
      console.error('OCR识别失败:', error);
      throw error;
    }
  }

  /**
   * 使用Mac系统的OCR功能
   * @param {string} imagePath - 图片路径
   * @returns {Promise<string>} OCR结果
   */
  async useMacOCR(imagePath) {
    try {
      // 使用Mac系统的vision命令（如果可用）
      // 注意：这个命令可能不是所有Mac系统都支持
      const command = `vision -i "${imagePath}" -o -`;
      const { stdout } = await execAsync(command);
      return stdout.trim();
    } catch (error) {
      throw new Error('Mac系统OCR不可用');
    }
  }

  /**
   * 使用本地Tesseract进行OCR识别
   * @param {string} imagePath - 图片路径
   * @returns {Promise<string>} OCR结果
   */
  async useLocalTesseract(imagePath) {
    try {
      // 检查tesseract是否安装
      await execAsync('which tesseract');
      
      // 使用tesseract进行OCR识别
      // -l chi_sim+eng 表示使用中文简体和英文
      const command = `tesseract "${imagePath}" stdout -l chi_sim+eng`;
      const { stdout } = await execAsync(command);
      
      return stdout.trim();
    } catch (error) {
      console.error('本地Tesseract调用失败:', error);
      throw new Error('本地Tesseract不可用，请安装tesseract-ocr');
    }
  }

  /**
   * 清理临时文件
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
      console.error('清理临时文件失败:', error);
    }
  }
}

module.exports = MacTools; 