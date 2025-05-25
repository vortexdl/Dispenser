# Masqr Anti-Link-Leaking System Guild Configuration

All user-facing Masqr settings are configured per-guild through Discord
commands:

- **Enabled**: Whether Masqr protection is active for the guild
- **Validation Endpoint URL**: Custom endpoint URL for the guild's proxy
  validation
- **License Expiration**: Default and maximum license expiration times
- **Whitelisted Domains**: Domains that bypass Masqr protection

Use `/masqr config` commands to manage these settings.

1. **Enable Masqr for your guild:**
   ```
   /masqr config set enabled true
   ```

2. **Set validation endpoint (if using custom proxy):**
   ```
   /masqr config set validation_endpoint_url https://example.com/validate
   ```

3. **Configure license expiration (optional):**
   ```
   /masqr config set default_license_expiration_hours 72
   /masqr config set max_license_expiration_hours 168
   ```

4. **Add domains for protection:**
   ```
   /masqr domain add example.com psk-key-here
   ```

5. **Enable Masqr protection on links:**
   ```
   /masqr link protect https://example.com/some-link category-name
   ```

### 3. Testing

1. Generate a test license:
   ```
   /masqr license generate category-name
   ```

2. The bot will provide instructions for accessing the protected content

## Architecture

### Components

1. **Licensing Server** (`src/masqr/licensingServer.ts`)
   - Generates and validates single-use licenses
   - Secured with bearer token authentication
   - Automatic cleanup of expired licenses

2. **Validation Middleware** (`src/masqr/middleware.ts`)
   - Hono.js middleware for protecting web applications
   - Cookie-based sessions and domain whitelisting
   - Custom failure pages per domain

3. **Discord Commands** (`src/commands/masqr.ts`)
   - Guild configuration management
   - Domain and license administration
   - Link protection controls

4. **Database Collections**
   - `masqrLicenses`: Active and used licenses
   - `masqrDomains`: Configured domains with PSKs
   - `masqrAccessLogs`: Audit logs for access attempts

## Troubleshooting

### Common Issues

1. **"Domain not configured" error**
   - Ensure domain is added with `/masqr domain add`
   - Verify domain is enabled with `/masqr domain list`

2. **"Masqr disabled for guild" error**
   - Enable Masqr with `/masqr config set enabled true`

3. **License validation fails**
   - Check if license has expired
   - Verify the license hasn't been used already
   - Ensure correct domain is being accessed

4. **Licensing server not starting**
   - Check `MASQR_API_KEY` environment variable
   - Verify port is not in use
   - Check `MASQR_LICENSING_SERVER_ENABLED` setting
