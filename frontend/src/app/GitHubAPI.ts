import GitHubService from './lib/GitHub';
import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class VEXDeploymentController {
  private githubService: GitHubService;
  private app: express.Application;
  private currentDeploymentId: number | null = null;

  constructor() {
    this.githubService = new GitHubService();
    this.app = express();
    this.setupEventListeners();
    this.setupRoutes();
  }

  /**
   * Set up GitHub service event listeners
   */
  private setupEventListeners(): void {
    // Handle new commits
    this.githubService.on('newCommit', async (commit) => {
      console.log('New commit detected:', commit.sha.substring(0, 7));
      console.log('Message:', commit.message);
      console.log('Author:', commit.author.name);
      
      // Optionally auto-deploy on new commits to main branch
      if (process.env.AUTO_DEPLOY === 'true') {
        await this.deployCommit(commit.sha);
      }
    });

    // Handle push events from webhooks
    this.githubService.on('push', async (pushData) => {
      console.log(`Push to ${pushData.branch}: ${pushData.commits.length} commits`);
      
      // Log each commit in the push
      interface Commit {
        id: string;
        message: string;
        // Add other expected properties here, for example:
        author?: { name: string; email?: string };
        timestamp?: string;
      }
      pushData.commits.forEach((commit: Commit) => {
        console.log(`  ${commit.id.substring(0, 7)}: ${commit.message}`);
      });
    });

    // Handle workflow run updates
    this.githubService.on('workflowRun', (workflowData) => {
      const { action, workflowRun } = workflowData;
      console.log(`Workflow "${workflowRun.name}" ${action}: ${workflowRun.status}`);
      
      if (workflowRun.conclusion) {
        console.log(`Conclusion: ${workflowRun.conclusion}`);
      }
    });

    // Handle check run updates
    this.githubService.on('checkRun', (checkData) => {
      const { action, checkRun } = checkData;
      console.log(`Check "${checkRun.name}" ${action}: ${checkRun.status}`);
    });

    // Handle deployment events
    this.githubService.on('deploymentCreated', (deployment) => {
      console.log(`Deployment created: ${deployment.deploymentId}`);
      this.currentDeploymentId = deployment.deploymentId;
    });

    // Handle pull requests
    this.githubService.on('pullRequested', async (pullData) => {
      console.log(`Pull requested for branch: ${pullData.branch}`);
      await this.executeGitPull(pullData.branch);
    });

    // Handle errors
    this.githubService.on('error', (error) => {
      console.error('GitHub service error:', error);
    });
  }

  /**
   * Set up Express routes for the dashboard
   */
  private setupRoutes(): void {
    this.app.use(express.json());

    // Webhook endpoint
    this.app.post('/webhook/github', (req, res) => {
      this.githubService.handleWebhook(req, res);
    });

    // API endpoint to get current status
    this.app.get('/api/github/status', async (req, res) => {
      try {
        const branchInfo = await this.githubService.getCurrentBranchInfo();
        const branches = await this.githubService.getBranches();
        const repoInfo = await this.githubService.getRepositoryInfo();
        
        res.json({
          repository: repoInfo,
          currentBranch: branchInfo,
          branches,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API endpoint to get commit history
    this.app.get('/api/github/commits/:branch?', async (req, res) => {
      try {
        const branch = req.params.branch;
        const limit = parseInt(req.query.limit as string) || 10;
        const commits = await this.githubService.getCommitHistory(branch, limit);
        
        res.json({
          commits,
          branch: branch || 'default',
          count: commits.length
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API endpoint to trigger deployment
    this.app.post('/api/deploy', async (req, res) => {
      try {
        const { sha, branch, environment = 'vex-brain' } = req.body;
        
        let commitSha = sha;
        if (!commitSha) {
          const latestCommit = await this.githubService.getLatestCommit(branch);
          commitSha = latestCommit.sha;
        }

        const result = await this.deployCommit(commitSha, environment);
        
        res.json({
          success: result.success,
          deploymentId: result.deploymentId,
          sha: commitSha,
          environment
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API endpoint to get workflow runs
    this.app.get('/api/github/workflows/:branch?', async (req, res) => {
      try {
        const branch = req.params.branch;
        const limit = parseInt(req.query.limit as string) || 10;
        const workflows = await this.githubService.getWorkflowRuns(branch, limit);
        
        res.json({
          workflows,
          branch: branch || 'all',
          count: workflows.length
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API endpoint to pull latest changes
    this.app.post('/api/github/pull', async (req, res) => {
      try {
        const { branch } = req.body;
        const result = await this.githubService.pullLatestChanges(branch);
        
        res.json(result);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * Deploy a specific commit to the VEX Brain
   */
  private async deployCommit(sha: string, environment: string = 'vex-brain'): Promise<{
    success: boolean;
    deploymentId?: number;
    error?: string;
  }> {
    try {
      // Create GitHub deployment
      const deploymentResult = await this.githubService.createDeployment(
        sha,
        environment,
        `Deploy ${sha.substring(0, 7)} to VEX Brain`
      );

      if (!deploymentResult.success) {
        return deploymentResult;
      }

      const deploymentId = deploymentResult.deploymentId!;
      
      // Update deployment status to pending
      await this.githubService.updateDeploymentStatus(
        deploymentId,
        'pending',
        'Starting deployment to VEX Brain'
      );

      try {
        // Execute the actual deployment process
        await this.executeDeployment(sha);
        
        // Update deployment status to success
        await this.githubService.updateDeploymentStatus(
          deploymentId,
          'success',
          'Successfully deployed to VEX Brain'
        );

        return {
          success: true,
          deploymentId
        };
      } catch (deployError) {
        // Update deployment status to failure
        await this.githubService.updateDeploymentStatus(
          deploymentId,
          'failure',
          `Deployment failed: ${deployError instanceof Error ? deployError.message : 'Unknown error'}`
        );

        throw deployError;
      }
    } catch (error) {
      console.error('Deployment error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute git pull operation
   */
  private async executeGitPull(branch: string): Promise<void> {
    try {
      console.log(`Executing git pull for branch: ${branch}`);
      
      const commands = [
        `git fetch origin`,
        `git checkout ${branch}`,
        `git pull origin ${branch}`
      ];

      for (const command of commands) {
        console.log(`Executing: ${command}`);
        const { stdout, stderr } = await execAsync(command, {
          cwd: process.env.REPO_PATH || './vex-project'
        });
        
        if (stdout) console.log('stdout:', stdout);
        if (stderr) console.log('stderr:', stderr);
      }
      
      console.log('Git pull completed successfully');
    } catch (error) {
      console.error('Git pull failed:', error);
      throw error;
    }
  }

  /**
   * Execute the actual deployment to VEX Brain
   */
  private async executeDeployment(sha: string): Promise<void> {
    try {
      console.log(`Starting deployment of commit ${sha}`);
      
      // Step 1: Pull the specific commit
      await execAsync(`git checkout ${sha}`, {
        cwd: process.env.REPO_PATH || './vex-project'
      });

      // Step 2: Build the project
      console.log('Building VEX project...');
      const buildCommand = process.env.BUILD_COMMAND || 'make build';
      await execAsync(buildCommand, {
        cwd: process.env.REPO_PATH || './vex-project'
      });

      // Step 3: Flash to VEX Brain
      console.log('Flashing to VEX Brain...');
      const flashCommand = process.env.FLASH_COMMAND || 'make upload';
      await execAsync(flashCommand, {
        cwd: process.env.REPO_PATH || './vex-project'
      });

      console.log('Deployment completed successfully');
    } catch (error) {
      console.error('Deployment execution failed:', error);
      throw error;
    }
  }

  /**
   * Start the server
   */
  public start(port: number = 3001): void {
    this.app.listen(port, () => {
      console.log(`VEX Deployment Server running on port ${port}`);
      console.log(`Webhook endpoint: http://localhost:${port}/webhook/github`);
      console.log('GitHub service initialized and polling for changes...');
    });
  }

  /**
   * Clean up resources
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down VEX Deployment Server...');
    this.githubService.stopPolling();
    console.log('Server shut down successfully');
  }
}