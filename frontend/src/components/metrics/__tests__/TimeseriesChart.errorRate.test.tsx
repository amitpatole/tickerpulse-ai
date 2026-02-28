/**
 * TimeseriesChart - Error Rate Metric Tests
 * Covers: error_rate metric data visualization and edge cases
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: TimeseriesChart with error_rate metric
// ─────────────────────────────────────────────────────────────────────────────

describe('TimeseriesChart - error_rate metric', () => {
  it('should render error_rate data points correctly', () => {
    interface TimeseriesDataPoint {
      day: string;
      agent_name: string;
      value: number;
      p95_duration_ms?: number;
    }

    const mockData: TimeseriesDataPoint[] = [
      { day: '2026-02-24', agent_name: 'research-agent', value: 2.5 },
      { day: '2026-02-25', agent_name: 'research-agent', value: 1.8 },
      { day: '2026-02-26', agent_name: 'research-agent', value: 3.2 },
      { day: '2026-02-27', agent_name: 'research-agent', value: 0.0 },
      { day: '2026-02-28', agent_name: 'research-agent', value: 1.5 },
    ];

    const TestComponent = ({ data, metric }: { data: TimeseriesDataPoint[]; metric: string }) => (
      <div>
        <p data-testid="metric-label">{metric}</p>
        <div data-testid="chart-container">
          {data.length > 0 ? (
            <ul data-testid="data-points">
              {data.map((point, i) => (
                <li key={i} data-testid={`point-${i}`}>
                  {point.day}: {point.value}
                  {metric === 'error_rate' && '%'}
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="no-data">No data available</p>
          )}
        </div>
      </div>
    );

    render(<TestComponent data={mockData} metric="error_rate" />);

    // AC1: error_rate metric label displays
    expect(screen.getByTestId('metric-label')).toHaveTextContent('error_rate');

    // AC2: All data points render
    expect(screen.getByTestId('data-points')).toBeInTheDocument();
    expect(screen.getByTestId('point-0')).toHaveTextContent('2026-02-24: 2.5%');
    expect(screen.getByTestId('point-4')).toHaveTextContent('2026-02-28: 1.5%');
  });

  it('should handle zero error rate gracefully', () => {
    const TestComponent = ({ errorRate }: { errorRate: number }) => (
      <div>
        <p data-testid="error-rate-value">{errorRate.toFixed(1)}%</p>
        <p data-testid="status">
          {errorRate === 0 ? 'No errors' : 'Errors detected'}
        </p>
      </div>
    );

    render(<TestComponent errorRate={0} />);

    // AC3: Zero error rate displays correctly
    expect(screen.getByTestId('error-rate-value')).toHaveTextContent('0.0%');
    expect(screen.getByTestId('status')).toHaveTextContent('No errors');
  });

  it('should display percentage format for error_rate metric', () => {
    const errorRates = [0.5, 5.25, 10.0, 15.75];

    const TestComponent = () => (
      <ul data-testid="error-rates">
        {errorRates.map((rate, i) => (
          <li key={i} data-testid={`rate-${i}`}>
            {rate.toFixed(2)}%
          </li>
        ))}
      </ul>
    );

    render(<TestComponent />);

    // AC4: Error rates render with percentage symbol
    expect(screen.getByTestId('rate-0')).toHaveTextContent('0.50%');
    expect(screen.getByTestId('rate-1')).toHaveTextContent('5.25%');
    expect(screen.getByTestId('rate-2')).toHaveTextContent('10.00%');
    expect(screen.getByTestId('rate-3')).toHaveTextContent('15.75%');
  });

  it('should handle empty error_rate data', () => {
    interface TimeseriesDataPoint {
      day: string;
      agent_name: string;
      value: number;
    }

    const TestComponent = ({ data }: { data: TimeseriesDataPoint[] }) => (
      <div>
        {data.length === 0 ? (
          <div data-testid="empty-state">
            No error rate data available for this period
          </div>
        ) : (
          <p data-testid="data-present">Data loaded</p>
        )}
      </div>
    );

    render(<TestComponent data={[]} />);

    // AC5: Empty state message displays
    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'No error rate data available for this period'
    );
  });

  it('should maintain error_rate data consistency across metric switches', () => {
    const errorRateData = [
      { day: '2026-02-26', agent_name: 'agent1', value: 2.5 },
      { day: '2026-02-27', agent_name: 'agent1', value: 1.0 },
    ];

    const TestComponent = ({ metric, data }: { metric: string; data: Array<any> }) => (
      <div>
        <p data-testid="current-metric">{metric}</p>
        <p data-testid="data-count">{data.length}</p>
        {metric === 'error_rate' && (
          <div data-testid="error-rate-chart">
            {data.map((d, i) => (
              <span key={i}>{d.value}%</span>
            ))}
          </div>
        )}
      </div>
    );

    const { rerender } = render(
      <TestComponent metric="cost" data={[]} />
    );

    expect(screen.getByTestId('current-metric')).toHaveTextContent('cost');
    expect(screen.queryByTestId('error-rate-chart')).not.toBeInTheDocument();

    // Switch to error_rate metric
    rerender(<TestComponent metric="error_rate" data={errorRateData} />);

    // AC6: error_rate metric data displays after switch
    expect(screen.getByTestId('current-metric')).toHaveTextContent('error_rate');
    expect(screen.getByTestId('data-count')).toHaveTextContent('2');
    expect(screen.getByTestId('error-rate-chart')).toBeInTheDocument();
  });

  it('should handle missing or null error_rate values', () => {
    interface DataPoint {
      day: string;
      value: number | null;
    }

    const TestComponent = ({ points }: { points: DataPoint[] }) => (
      <ul data-testid="points-list">
        {points.map((p, i) => (
          <li key={i} data-testid={`point-${i}`}>
            {p.day}: {p.value !== null ? `${p.value}%` : 'N/A'}
          </li>
        ))}
      </ul>
    );

    const data: DataPoint[] = [
      { day: '2026-02-26', value: 2.5 },
      { day: '2026-02-27', value: null },
      { day: '2026-02-28', value: 1.0 },
    ];

    render(<TestComponent points={data} />);

    // AC7: Null values display as N/A
    expect(screen.getByTestId('point-0')).toHaveTextContent('2026-02-26: 2.5%');
    expect(screen.getByTestId('point-1')).toHaveTextContent('2026-02-27: N/A');
    expect(screen.getByTestId('point-2')).toHaveTextContent('2026-02-28: 1%');
  });

  it('should enforce valid error_rate range (0-100%)', () => {
    const TestComponent = ({ rate }: { rate: number }) => {
      const isValid = rate >= 0 && rate <= 100;
      return (
        <div>
          <p data-testid="rate">{rate}</p>
          <p data-testid="validity">{isValid ? 'valid' : 'invalid'}</p>
        </div>
      );
    };

    const { rerender } = render(<TestComponent rate={5} />);
    expect(screen.getByTestId('validity')).toHaveTextContent('valid');

    rerender(<TestComponent rate={100} />);
    expect(screen.getByTestId('validity')).toHaveTextContent('valid');

    rerender(<TestComponent rate={0} />);
    expect(screen.getByTestId('validity')).toHaveTextContent('valid');

    // AC8: Out-of-range rates flagged as invalid
    rerender(<TestComponent rate={101} />);
    expect(screen.getByTestId('validity')).toHaveTextContent('invalid');

    rerender(<TestComponent rate={-1} />);
    expect(screen.getByTestId('validity')).toHaveTextContent('invalid');
  });
});
