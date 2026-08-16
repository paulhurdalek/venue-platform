import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateLocationDto } from './platform.dto.js';

async function validateCountryCode(countryCode: string | null) {
  const dto = plainToInstance(UpdateLocationDto, { version: 1, countryCode });
  return { dto, errors: await validate(dto) };
}

describe('UpdateLocationDto countryCode', () => {
  it('trims and normalizes two ASCII letters', async () => {
    const { dto, errors } = await validateCountryCode(' de ');

    expect(errors).toHaveLength(0);
    expect(dto.countryCode).toBe('DE');
  });

  it('allows null', async () => {
    const { errors } = await validateCountryCode(null);

    expect(errors).toHaveLength(0);
  });

  it.each(['49', 'D1', 'DÄ', 'D', 'DEU'])('rejects invalid country code %s', async (value) => {
    const { errors } = await validateCountryCode(value);

    expect(errors.some((error) => error.property === 'countryCode')).toBe(true);
  });
});
