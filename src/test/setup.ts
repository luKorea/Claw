import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Tauri invoke 统一 mock。所有 import @/lib/keyring / @/lib/db 的模块都依赖这个。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));
