```tsx
/**
 * Tests for ConsensusBar component.
 *
 * Coverage:
 * - AC1: All same rating → matching verdict
 * - AC2: Tie / disagreement → SPLIT verdict
 * - AC3: No rated results → renders nothing
 * - AC4: Breakdown text shows vote counts
 * - AC5: Errored results are excluded from consensus
 */

import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConsensusBar from '../ConsensusBar';
import type { ComparisonResult } from '@/lib/types';

describe('ConsensusBar', () => {
  // =========================================================================
  // AC3: No rated results
  // =========================================================================

  test('renders nothing when all results have errors', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude', error: 'timeout' },
      { provider: 'openai',    model: 'gpt-4o', error: 'rate limit' },
    ];
    const { container } = render(<ConsensusBar results={results} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when results array is empty', () => {
    const { container } = render(<ConsensusBar results={[]} />);
    expect(container.firstChild).toBeNull();
  });

  // =========================================================================
  // AC1: Matching verdict when all agree
  // =========================================================================

  test('shows BUY verdict when all providers rate BUY', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude',  rating: 'BUY', score: 80, confidence: 90 },
      { provider: 'openai',    model: 'gpt-4o',  rating: 'BUY', score: 75, confidence: 85 },
    ];
    render(<ConsensusBar results={results} />);
    expect(screen.getByTestId('consensus-verdict')).toHaveTextContent('BUY');
  });

  test('shows HOLD verdict when all providers rate HOLD', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude',         rating: 'HOLD', score: 55, confidence: 70 },
      { provider: 'google',    model: 'gemini-2.0-flash', rating: 'HOLD', score: 50, confidence: 65 },
    ];
    render(<ConsensusBar results={results} />);
    expect(screen.getByTestId('consensus-verdict')).toHaveTextContent('HOLD');
  });

  test('shows SELL verdict when all providers rate SELL', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude',  rating: 'SELL', score: 20, confidence: 85 },
      { provider: 'openai',    model: 'gpt-4o',  rating: 'SELL', score: 25, confidence: 80 },
      { provider: 'google',    model: 'gemini',  rating: 'SELL', score: 15, confidence: 75 },
    ];
    render(<ConsensusBar results={results} />);
    expect(screen.getByTestId('consensus-verdict')).toHaveTextContent('SELL');
  });

  // =========================================================================
  // AC2: SPLIT when providers disagree
  // =========================================================================

  test('shows SPLIT verdict when two providers give different ratings', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude', rating: 'BUY',  score: 80, confidence: 90 },
      { provider: 'openai',    model: 'gpt-4o', rating: 'SELL', score: 30, confidence: 70 },
    ];
    render(<ConsensusBar results={results} />);
    expect(screen.getByTestId('consensus-verdict')).toHaveTextContent('SPLIT');
  });

  test('shows HOLD when majority vote is HOLD', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude',  rating: 'HOLD', score: 55, confidence: 70 },
      { provider: 'openai',    model: 'gpt-4o',  rating: 'HOLD', score: 60, confidence: 75 },
      { provider: 'google',    model: 'gemini',  rating: 'BUY',  score: 70, confidence: 80 },
    ];
    render(<ConsensusBar results={results} />);
    expect(screen.getByTestId('consensus-verdict')).toHaveTextContent('HOLD');
  });

  // =========================================================================
  // AC4: Breakdown text
  // =========================================================================

  test('shows breakdown text with correct vote counts', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude', rating: 'BUY',  score: 80, confidence: 90 },
      { provider: 'openai',    model: 'gpt-4o', rating: 'HOLD', score: 55, confidence: 70 },
      { provider: 'google',    model: 'gemini', rating: 'BUY',  score: 75, confidence: 85 },
    ];
    render(<ConsensusBar results={results} />);
    const breakdown = screen.getByTestId('consensus-breakdown');
    expect(breakdown).toHaveTextContent('2 BUY');
    expect(breakdown).toHaveTextContent('1 HOLD');
  });

  // =========================================================================
  // AC5: Errored results excluded
  // =========================================================================

  test('ignores errored results in consensus calculation', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude',  rating: 'BUY', score: 80, confidence: 90 },
      { provider: 'openai',    model: 'gpt-4o',  error: 'rate limit', duration_ms: 0 },
    ];
    render(<ConsensusBar results={results} />);
    expect(screen.getByTestId('consensus-verdict')).toHaveTextContent('BUY');
  });

  test('renders consensus bar container element', () => {
    const results: ComparisonResult[] = [
      { provider: 'anthropic', model: 'claude', rating: 'BUY', score: 80, confidence: 90 },
    ];
    render(<ConsensusBar results={results} />);
    expect(screen.getByTestId('consensus-bar')).toBeInTheDocument();
  });
});
```