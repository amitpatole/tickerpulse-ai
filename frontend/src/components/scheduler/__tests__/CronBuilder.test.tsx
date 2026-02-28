import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CronBuilder from '../CronBuilder';

const intervalValue = { trigger: 'interval' as const, trigger_args: { seconds: 3600 } };
const cronValue = { trigger: 'cron' as const, trigger_args: { hour: 9, minute: 0 } };

describe('CronBuilder', () => {
  // -------------------------------------------------------------------------
  // Interval mode
  // -------------------------------------------------------------------------

  it('renders seconds input in interval mode', () => {
    render(<CronBuilder value={intervalValue} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('3600')).toBeInTheDocument();
    expect(screen.getByText(/= Every 1h/)).toBeInTheDocument();
  });

  it('clicking a preset emits correct trigger_args', () => {
    const onChange = vi.fn();
    render(<CronBuilder value={intervalValue} onChange={onChange} />);
    fireEvent.click(screen.getByText('15m'));
    expect(onChange).toHaveBeenCalledWith({ trigger: 'interval', trigger_args: { seconds: 900 } });
  });

  it('highlights the active preset button', () => {
    render(<CronBuilder value={{ trigger: 'interval', trigger_args: { seconds: 900 } }} onChange={vi.fn()} />);
    expect(screen.getByText('15m').className).toContain('text-blue-400');
  });

  it('non-active preset has default styling', () => {
    render(<CronBuilder value={{ trigger: 'interval', trigger_args: { seconds: 900 } }} onChange={vi.fn()} />);
    expect(screen.getByText('1h').className).not.toContain('text-blue-400');
  });

  it('typing in interval input emits updated seconds', () => {
    const onChange = vi.fn();
    render(<CronBuilder value={intervalValue} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('3600'), { target: { value: '7200' } });
    expect(onChange).toHaveBeenCalledWith({ trigger: 'interval', trigger_args: { seconds: 7200 } });
  });

  it('does not emit onChange for zero or negative interval', () => {
    const onChange = vi.fn();
    render(<CronBuilder value={intervalValue} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('3600'), { target: { value: '0' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cron mode
  // -------------------------------------------------------------------------

  it('renders hour and minute inputs in cron mode', () => {
    render(<CronBuilder value={cronValue} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('9')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0')).toBeInTheDocument();
  });

  it('shows human-readable summary for weekday cron', () => {
    render(
      <CronBuilder
        value={{ trigger: 'cron', trigger_args: { hour: 8, minute: 30, day_of_week: 'mon-fri' } }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Weekdays.*8:30 AM/)).toBeInTheDocument();
  });

  it('shows "Every day" summary when no day_of_week set', () => {
    render(
      <CronBuilder
        value={{ trigger: 'cron', trigger_args: { hour: 12, minute: 0 } }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Every day.*12:00 PM/)).toBeInTheDocument();
  });

  it('emits updated hour in trigger_args', () => {
    const onChange = vi.fn();
    render(<CronBuilder value={cronValue} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('9'), { target: { value: '14' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'cron',
        trigger_args: expect.objectContaining({ hour: 14 }),
      }),
    );
  });

  it('emits updated day_of_week on select change', () => {
    const onChange = vi.fn();
    render(<CronBuilder value={cronValue} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('Every day'), { target: { value: 'mon-fri' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_args: expect.objectContaining({ day_of_week: 'mon-fri' }),
      }),
    );
  });

  it('omits day_of_week key when selecting "Every day"', () => {
    const onChange = vi.fn();
    render(
      <CronBuilder
        value={{ trigger: 'cron', trigger_args: { hour: 9, minute: 0, day_of_week: 'mon-fri' } }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('Weekdays (Mon–Fri)'), { target: { value: '' } });
    const emitted = onChange.mock.calls[0][0];
    expect(emitted.trigger_args).not.toHaveProperty('day_of_week');
  });

  // -------------------------------------------------------------------------
  // Tab switching
  // -------------------------------------------------------------------------

  it('switches from interval to cron', () => {
    const onChange = vi.fn();
    render(<CronBuilder value={intervalValue} onChange={onChange} />);
    fireEvent.click(screen.getByText('Cron (time-based)'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'cron' }));
  });

  it('switches from cron to interval', () => {
    const onChange = vi.fn();
    render(<CronBuilder value={cronValue} onChange={onChange} />);
    fireEvent.click(screen.getByText('Interval (recurring)'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'interval' }));
  });

  it('interval tab button is highlighted when trigger is interval', () => {
    render(<CronBuilder value={intervalValue} onChange={vi.fn()} />);
    expect(screen.getByText('Interval (recurring)').className).toContain('text-white');
    expect(screen.getByText('Cron (time-based)').className).not.toContain('text-white');
  });
});
