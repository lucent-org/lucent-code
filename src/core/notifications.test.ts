import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockShowErrorMessage, mockShowWarningMessage, mockExecuteCommand } = vi.hoisted(() => ({
  mockShowErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  mockShowWarningMessage: vi.fn(() => Promise.resolve(undefined)),
  mockExecuteCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: mockShowErrorMessage,
    showWarningMessage: mockShowWarningMessage,
    showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
}));

import { NotificationService } from './notifications';

describe('NotificationService', () => {
  let notifications: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notifications = new NotificationService();
  });

  it('should show API key error with Set API Key action', async () => {
    mockShowErrorMessage.mockResolvedValue('Set API Key');
    await notifications.handleError('No API key configured. Please set your OpenRouter API key.');
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('API key'),
      'Set API Key'
    );
    expect(mockExecuteCommand).toHaveBeenCalledWith('openRouterChat.setApiKey');
  });

  it('should show rate limit warning', async () => {
    await notifications.handleError('OpenRouter API error (429): Rate limited');
    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('Rate limited')
    );
  });

  it('should show auth error with Update API Key action', async () => {
    mockShowErrorMessage.mockResolvedValue('Update API Key');
    await notifications.handleError('OpenRouter API error (401): Unauthorized');
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Invalid API key'),
      'Update API Key'
    );
    expect(mockExecuteCommand).toHaveBeenCalledWith('openRouterChat.setApiKey');
  });

  it('should show network error', async () => {
    await notifications.handleError('fetch failed');
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('connect'),
      'Retry'
    );
  });

  it('should show generic error for unknown errors', async () => {
    await notifications.handleError('Something unexpected happened');
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Something unexpected happened')
    );
  });
});
