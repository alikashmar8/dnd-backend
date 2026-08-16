import { validateProductionConfig } from './production-config.validation';

const originalEnv = { ...process.env };

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  process.env = { ...originalEnv, ...env };
  try {
    fn();
  } finally {
    process.env = { ...originalEnv };
  }
}

describe('validateProductionConfig', () => {
  it('does nothing outside production', () => {
    expect(() =>
      withEnv({ NODE_ENV: 'development' }, () => {
        validateProductionConfig();
      }),
    ).not.toThrow();
  });

  it('passes when all production requirements are present', () => {
    expect(() =>
      withEnv(
        {
          NODE_ENV: 'production',
          STORAGE_ACCESS_KEY_ID: 'ak',
          STORAGE_SECRET_ACCESS_KEY: 'sk',
          SMTP_HOST: 'smtp.example.com',
        },
        () => {
          validateProductionConfig();
        },
      ),
    ).not.toThrow();
  });

  it('throws listing missing storage credentials and delivery channel', () => {
    expect(() =>
      withEnv({ NODE_ENV: 'production' }, () => {
        validateProductionConfig();
      }),
    ).toThrow(/STORAGE_ACCESS_KEY_ID/);
  });

  it('accepts Twilio as the delivery channel', () => {
    expect(() =>
      withEnv(
        {
          NODE_ENV: 'production',
          STORAGE_ACCESS_KEY_ID: 'ak',
          STORAGE_SECRET_ACCESS_KEY: 'sk',
          TWILIO_ACCOUNT_SID: 'ACxxx',
        },
        () => {
          validateProductionConfig();
        },
      ),
    ).not.toThrow();
  });

  it('rejects when only storage credentials are set', () => {
    expect(() =>
      withEnv(
        {
          NODE_ENV: 'production',
          STORAGE_ACCESS_KEY_ID: 'ak',
          STORAGE_SECRET_ACCESS_KEY: 'sk',
        },
        () => {
          validateProductionConfig();
        },
      ),
    ).toThrow(/SMTP_HOST/);
  });
});
