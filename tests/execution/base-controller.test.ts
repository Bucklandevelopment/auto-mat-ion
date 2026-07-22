/**
 * Tests for base controller utilities
 */

import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  classifyCameraType,
  BROWSER_PATHS,
  CDP_PORTS,
} from '../../src/execution/controllers/base-controller';

describe('Base Controller Utilities', () => {
  describe('detectPlatform', () => {
    it('should detect a valid platform', () => {
      const platform = detectPlatform();
      expect(['macos', 'windows', 'linux']).toContain(platform);
    });
  });

  describe('classifyCameraType', () => {
    it('should classify OBS Virtual Camera as virtual', () => {
      expect(classifyCameraType('OBS Virtual Camera')).toBe('virtual');
      expect(classifyCameraType('OBS-Camera')).toBe('virtual');
    });

    it('should classify ManyCam as virtual', () => {
      expect(classifyCameraType('ManyCam Virtual Webcam')).toBe('virtual');
    });

    it('should classify Snap Camera as virtual', () => {
      expect(classifyCameraType('Snap Camera')).toBe('virtual');
    });

    it('should classify XSplit VCam as virtual', () => {
      expect(classifyCameraType('XSplit VCam')).toBe('virtual');
    });

    it('should classify CamTwist as virtual', () => {
      expect(classifyCameraType('CamTwist')).toBe('virtual');
    });

    it('should classify Camo as virtual', () => {
      expect(classifyCameraType('Camo Camera')).toBe('virtual');
    });

    it('should classify NDI as virtual', () => {
      expect(classifyCameraType('NDI Video')).toBe('virtual');
    });

    it('should classify FaceTime as real', () => {
      expect(classifyCameraType('FaceTime HD Camera')).toBe('real');
    });

    it('should classify Logitech webcams as real', () => {
      expect(classifyCameraType('Logitech C920')).toBe('real');
      expect(classifyCameraType('Logitech BRIO')).toBe('real');
      expect(classifyCameraType('HD Pro Webcam C270')).toBe('real');
    });

    it('should classify iPhone/iPad cameras as real', () => {
      expect(classifyCameraType('iPhone Camera')).toBe('real');
      expect(classifyCameraType('iPad Camera')).toBe('real');
    });

    it('should classify Android cameras as real', () => {
      expect(classifyCameraType('Back Camera')).toBe('real');
      expect(classifyCameraType('Front Camera')).toBe('real');
      expect(classifyCameraType('camera 0, facing back')).toBe('real');
    });

    it('should classify integrated webcams as real', () => {
      expect(classifyCameraType('Integrated Webcam')).toBe('real');
      expect(classifyCameraType('Built-in Camera')).toBe('real');
    });

    it('should classify USB cameras as real', () => {
      expect(classifyCameraType('USB Camera')).toBe('real');
      expect(classifyCameraType('USB Video Device')).toBe('real');
    });

    it('should return unknown for unrecognized cameras', () => {
      expect(classifyCameraType('SomeRandomCamera123')).toBe('unknown');
      expect(classifyCameraType('')).toBe('unknown');
    });
  });

  describe('BROWSER_PATHS', () => {
    it('should have paths for all platforms', () => {
      expect(BROWSER_PATHS).toHaveProperty('macos');
      expect(BROWSER_PATHS).toHaveProperty('windows');
      expect(BROWSER_PATHS).toHaveProperty('linux');
    });

    it('should have Chrome path for macOS', () => {
      expect(BROWSER_PATHS.macos).toHaveProperty('chrome');
      expect(BROWSER_PATHS.macos.chrome).toContain('Google Chrome');
    });

    it('should have Chrome path for Windows', () => {
      expect(BROWSER_PATHS.windows).toHaveProperty('chrome');
      expect(BROWSER_PATHS.windows.chrome).toContain('chrome.exe');
    });

    it('should have Chrome path for Linux', () => {
      expect(BROWSER_PATHS.linux).toHaveProperty('chrome');
    });
  });

  describe('CDP_PORTS', () => {
    it('should have default port', () => {
      expect(CDP_PORTS.default).toBe(9222);
    });

    it('should have different ports for different browsers', () => {
      expect(CDP_PORTS.chrome).toBeDefined();
      expect(CDP_PORTS.edge).toBeDefined();
      expect(CDP_PORTS.chromium).toBeDefined();
    });

    it('should have unique ports to avoid conflicts', () => {
      const ports = Object.values(CDP_PORTS);
      const uniquePorts = new Set(ports);
      // At least the named browsers should have unique ports
      expect(uniquePorts.size).toBeGreaterThanOrEqual(3);
    });
  });
});
