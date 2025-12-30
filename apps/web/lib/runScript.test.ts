import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { runScript } from './runScript';

// Hoisted mock setup
const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));

describe('runScript', () => {
  let lastChild: any;

  function makeChild() {
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    return child;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    spawnMock.mockReset();

    // Create FRESH EventEmitter instances for every CALL
    spawnMock.mockImplementation(() => {
      lastChild = makeChild();
      return lastChild;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows process.execPath by default', async () => {
    const p = runScript(process.execPath, ['script.js']);
    // Wait for the mock to be called and child created
    lastChild.emit('close', 0);
    const result = await p;
    expect(result.code).toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ['script.js'],
      expect.objectContaining({ shell: false, windowsHide: true })
    );
  });

  it('BLOCKS simple "node" command if not explicitly whitelisted', async () => {
    // Default security: strictly process.execPath only
    const result = await runScript('node', ['-v']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('not allowed');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('ALLOWS "node" if explicitly whitelisted', async () => {
    const p = runScript('node', ['-v'], { allowCmds: ['node'] });
    lastChild.emit('close', 0);
    const result = await p;
    expect(result.code).toBe(0);
    expect(spawnMock).toHaveBeenCalledWith('node', expect.any(Array), expect.any(Object));
  });

  it('ALLOWS relaxed args like braces and brackets', async () => {
    // Should NOT block JSON-like strings or glob patterns
    const safeArgs = ['{"foo":"bar"}', '[1,2]', '(mask)'];
    const p = runScript(process.execPath, safeArgs);
    lastChild.emit('close', 0);
    const result = await p;
    expect(result.code).toBe(0);
    expect(spawnMock).toHaveBeenCalledWith(process.execPath, safeArgs, expect.any(Object));
  });

  it('BLOCKS dangerous metacharacters (including backslash and newline)', async () => {
    const badArgs = [
      'foo; bar',
      'foo | bar',
      'foo > out',
      'foo < in',
      '`ls`',
      '$(whoami)',
      'foo\nbar',
      'foo\\bar', // Backslash check
      'foo\0bar'
    ];
    for (const arg of badArgs) {
      spawnMock.mockClear();
      const result = await runScript(process.execPath, [arg]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('forbidden characters');
      expect(spawnMock).not.toHaveBeenCalled();
    }
  });

  it('BLOCKS dangerous Node flags and shells', async () => {
    const cases = ['--eval', '-e', '--inspect', 'bash', '-c'];
    for (const arg of cases) {
      spawnMock.mockClear();
      const result = await runScript(process.execPath, [arg]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('blocked');
      expect(spawnMock).not.toHaveBeenCalled();
    }
  });

  it('validates -r / --require flags', async () => {
    // Allowed default
    const p1 = runScript(process.execPath, ['-r', 'ts-node/register', 'script.js']);
    lastChild.emit('close', 0);
    await p1;
    expect(spawnMock).toHaveBeenCalled();

    spawnMock.mockClear();

    // Blocked
    const r1 = await runScript(process.execPath, ['-r', 'malicious-lib']);
    expect(r1.code).toBe(1);
    expect(spawnMock).not.toHaveBeenCalled();

    // Blocked via --require=
    const r2 = await runScript(process.execPath, ['--require=malicious-lib']);
    expect(r2.code).toBe(1);

    // Allowed override
    const p2 = runScript(process.execPath, ['-r', 'custom-lib'], { allowRequires: ['custom-lib'] });
    lastChild.emit('close', 0);
    await p2;
    expect(spawnMock).toHaveBeenCalled();
  });

  it('escalates timeout signals (SIGTERM -> SIGKILL)', async () => {
    const p = runScript(process.execPath, ['slow.js'], { timeoutMs: 1000 });

    // 1. Trigger initial timeout
    vi.advanceTimersByTime(1001);
    expect(lastChild.kill).toHaveBeenCalledWith('SIGTERM');

    // 2. Trigger escalation
    vi.advanceTimersByTime(2000);
    expect(lastChild.kill).toHaveBeenCalledWith('SIGKILL');

    lastChild.emit('close', null);
    const result = await p;
    expect(result.stderr).toContain('timed out');
  });

  it('truncates output strictly without exceeding limit', async () => {
    // Limit is very small (10 bytes), marker is ~20 bytes.
    // Logic should suppress marker to avoid overflow.
    const smallLimit = 10;
    const p = runScript(process.execPath, ['verbose'], { maxOutputBytes: smallLimit });

    const chunk = "1234567890123"; // 13 bytes
    lastChild.stdout.emit('data', chunk);

    lastChild.emit('close', 0);
    const result = await p;

    // Total len must be <= limited (10)
    // Content filled up to 10 bytes then stopped. Marker skipped because it didn't fit (standard marker > 10 bytes).
    expect(result.stdout.length).toBeLessThanOrEqual(smallLimit);
    expect(result.stdout).toBe('1234567890');
    expect(result.stdout).not.toContain('Truncated');
  });

  it('truncates output with marker when space permits', async () => {
    const limit = 50;
    const p = runScript(process.execPath, ['verbose'], { maxOutputBytes: limit });

    const chunk1 = "12345"; // 5 bytes
    lastChild.stdout.emit('data', chunk1);

    // Now overflow
    const large = "A".repeat(100);
    lastChild.stdout.emit('data', large);

    lastChild.emit('close', 0);
    const result = await p;

    expect(result.stdout).toContain('...[Output Truncated]');
    expect(result.stdout.length).toBeLessThanOrEqual(limit);
  });
});
