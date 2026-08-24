import { describe, expect, it } from 'vitest';

import { serviceUnitOptions, unitLabel } from './service-unit-labels';

describe('service unit labels', () => {
  it.each(serviceUnitOptions)('labels $value as $label', ({ value, label }) => {
    expect(unitLabel(value)).toBe(label);
  });
});
