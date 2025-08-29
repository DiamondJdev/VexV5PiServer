# VEX GitHub Integration Setup Guide

This guide will help you set up the GitHub integration for your VEX Deployment Dashboard.

## Prerequisites

- Node.js 18+ and npm
- GitHub repository with your VEX robot code
- GitHub Personal Access Token or GitHub App
- Raspberry Pi with access to VEX Brain

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set up Environment Variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your actual values:
   ```bash
   # Required - GitHub Personal Access Token
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   
   # Required - Repository details
   GITHUB_OWNER=your-github-username
   GITHUB_REPO=your-vex-robot-repo
   GITHUB_DEFAULT_BRANCH=main
   
   # Required - Webhook security
   GITHUB_WEBHOOK_SECRET=your-secure-secret-here
   ```

3. **Build the Project**
   ```bash
   npm run build
   ```

## GitHub Setup

### Option 1: Personal Access Token (Recommended for personal projects)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with the following scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `admin:repo_hook` (Admin access to repository hooks)
   - `deployments` (Access deployment status)

### Option 2: GitHub App (Recommended for organizations)

1. Create a GitHub App:
   - Go to GitHub Settings → Developer settings → GitHub Apps → New GitHub App
   - Set Webhook URL to `https://your-pi.local:3000/webhook/github`
   - Set webhook secret (same as `GITHUB_WEBHOOK_SECRET` in .env)
   - Grant permissions:
     - Repository permissions:
       - Contents: Read
       - Metadata: Read
       - Pull requests: Read
       - Deployments: Write
       - Actions: Read
     - Subscribe to events:
       - Push
       - Workflow run
       - Check run
       - Deployment

2. Install the app on your repository
3. Update your `.env` file with app credentials:
   ```bash
   GITHUB_APP_ID=123456
   GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   GITHUB_INSTALLATION_ID=12345678
   ```

## Webhook Setup

1. **Local Development with ngrok** (for testing):
   ```bash
   npx ngrok http 3001
   ```
   Use the ngrok URL as your webhook URL: `https://abc123.ngrok.io/webhook/github`

2. **Production Setup**:
   - Configure your router to forward port 3001 to your Raspberry Pi
   - Use a reverse proxy (nginx/Caddy) with SSL
   - Set webhook URL to: `https://your-domain.com/webhook/github`

3. **Add Webhook to Repository**:
   - Go to your repository → Settings → Webhooks → Add webhook
   - Payload URL: `https://your-pi.local:3001/webhook/github`
   - Content type: `application/json`
   - Secret: Your `GITHUB_WEBHOOK_SECRET`
   - Events: Push, Workflow runs, Check runs

## Usage

### Starting the Service

```bash
# Development
npm run dev

# Production
npm start
```

### API Endpoints

- `GET /api/github/status` - Get current repository status
- `GET /api/github/commits/:branch?` - Get commit history
- `GET /api/github/workflows/:branch?` - Get workflow runs
- `POST /api/deploy` - Trigger deployment
- `POST /api/github/pull` - Pull latest changes
- `POST /webhook/github` - GitHub webhook endpoint

### Event-Driven Usage

```typescript
import GitHubService from './GitHub';

const github = new GitHubService();

// Listen for new commits
github.on('newCommit', (commit) => {
  console.log('New commit:', commit.message);
  // Trigger deployment
});

// Listen for workflow updates
github.on('workflowRun', (workflow) => {
  console.log('Workflow status:', workflow.workflowRun.status);
});

// Listen for deployment events
github.on('deploymentCreated', (deployment) => {
  console.log('Deployment created:', deployment.deploymentId);
});
```

## VEX Brain Integration

### Build Commands Setup

Add these environment variables to your `.env`:

```bash
# Repository path on Raspberry Pi
REPO_PATH=/home/pi/vex-project

# Build command for VEX project
BUILD_COMMAND="make clean && make"

# Flash command to upload to VEX Brain
FLASH_COMMAND="make upload"

# Auto-deploy on push to main branch
AUTO_DEPLOY=false
```

### Deployment Process

The service handles the complete deployment pipeline:

1. **GitHub Event** → Webhook received or polling detects change
2. **Git Pull** → Latest code pulled to Raspberry Pi
3. **Build** → VEX project compiled
4. **Deploy** → Binary uploaded to VEX Brain
5. **Status Update** → GitHub deployment status updated

## Security Considerations

1. **Webhook Secret**: Always use a strong, unique webhook secret
2. **Token Permissions**: Use minimal required permissions for GitHub tokens
3. **Network Security**: Use HTTPS and consider VPN access
4. **Rate Limiting**: GitHub API has rate limits (5000/hour for authenticated requests)
5. **Error Handling**: Monitor logs for failed deployments and API errors

## Troubleshooting

### Common Issues

1. **Webhook not received**:
   - Check firewall settings on Raspberry Pi
   - Verify webhook URL is accessible from internet
   - Check webhook secret matches

2. **GitHub API rate limits**:
   - Use GitHub App instead of personal token for higher limits
   - Implement exponential backoff for failed requests

3. **Build failures**:
   - Check VEX toolchain installation on Raspberry Pi
   - Verify file permissions and paths
   - Check build command in `.env`

4. **Authentication errors**:
   - Verify token has required permissions
   - Check token expiration
   - For GitHub Apps, verify installation ID

### Debug Mode

Enable detailed logging:

```bash
DEBUG=github:* npm run dev
```

### Testing Webhook Locally

```bash
# Send test webhook payload
curl -X POST http://localhost:3001/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d @test-payload.json
```

## Monitoring

The service emits events that you can monitor:

```typescript
github.on('error', (error) => {
  console.error('GitHub service error:', error);
  // Send alert to monitoring system
});

github.on('deploymentStatusUpdated', (status) => {
  console.log('Deployment status:', status);
  // Update dashboard UI
});
```

## Integration with Dashboard

The GitHub service integrates seamlessly with your dashboard:

```typescript
// In your dashboard API routes
app.get('/api/dashboard/status', async (req, res) => {
  const status = await github.getCurrentBranchInfo();
  const branches = await github.getBranches();
  
  res.json({
    currentBranch: status,
    allBranches: branches,
    lastUpdate: new Date()
  });
});
```

This setup provides a robust, production-ready GitHub integration for your VEX deployment pipeline.