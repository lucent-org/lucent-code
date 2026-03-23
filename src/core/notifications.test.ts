import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockShowErrorMessage, mockShowWarningMessage, mockShowInformationMessage, mockExecuteCommand } = vi.hoisted(() => ({
  mockShowErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  mockShowWarningMessage: vi.fn(() => Promise.resolve(undefined)),
  mockShowInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  mockExecuteCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: mockShowErrorMessage,
    showWarningMessage: mockShowWarningMessage,
    showInformationMessage: mockShowInformationMessage,
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

  it('shows info message with OAuth and manual API key options when no key configured', async () => {
    mockShowInformationMessage.mockResolvedValue('Enter API Key manually');
    await notifications.handleError('No API key configured. Please set your OpenRouter API key.');
    expect(mockShowInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('Sign in'),
      'Sign in with OpenRouter',
      'Enter API Key manually'
    );
    expect(mockExecuteCommand).toHaveBeenCalledWith('lucentCode.setApiKey');
  });

  it('triggers OAuth when user chooses Sign in with OpenRouter', async () => {
    mockShowInformationMessage.mockResolvedValue('Sign in with OpenRouter');
    await notifications.handleError('No API key configured. Please set your OpenRouter API key.');
    expect(mockExecuteCommand).toHaveBeenCalledWith('lucentCode.startOAuth');
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
    expect(mockExecuteCommand).toHaveBeenCalledWith('lucentCode.setApiKey');
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
