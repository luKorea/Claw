import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Tauri invoke 统一 mock。所有 import @/lib/keyring / @/lib/db 的模块都依赖这个。
vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel<T> {
    onmessage?: (message: T) => void;

    constructor(onmessage?: (message: T) => void) {
      this.onmessage = onmessage;
    }
  },
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));
