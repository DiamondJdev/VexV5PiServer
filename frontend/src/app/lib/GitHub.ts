import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { Request, Response } from 'express';

// Environment variables interface
interface GitHubConfig {
  token: string;
  appId?: string;
  privateKey?: string;
  installationId?: string;
  webhookSecret: string;
  owner: string;
  repo: string;
  defaultBranch: string;
}

// Type definitions
interface CommitData {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
}

interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
  ahead: number;
  behind: number;
}

interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null;
  branch: string;
  sha: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface CheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  sha: string;
  url: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface DeploymentStatus {
  success: boolean;
  deploymentId?: number;
  error?: string;
}

class GitHubService extends EventEmitter {
  private octokit: Octokit;
  private config: GitHubConfig;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastKnownSha: string | null = null;

  constructor() {
    super();
    this.config = this.loadConfig();
    this.octokit = this.initializeOctokit();
    this.startPolling();
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfig(): GitHubConfig {
    const requiredVars = ['GITHUB_TOKEN', 'GITHUB_WEBHOOK_SECRET', 'GITHUB_OWNER', 'GITHUB_REPO'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return {
      token: process.env.GITHUB_TOKEN!,
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
      installationId: process.env.GITHUB_INSTALLATION_ID,
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
      owner: process.env.GITHUB_OWNER!,
      repo: process.env.GITHUB_REPO!,
      defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main'
    };
  }

  /**
   * Initialize Octokit with appropriate authentication
   */
  private initializeOctokit(): Octokit {
    // Use GitHub App authentication if available, otherwise use personal access token
    if (this.config.appId && this.config.privateKey && this.config.installationId) {
      return new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: this.config.appId,
          privateKey: this.config.privateKey.replace(/\\n/g, '\n'),
          installationId: this.config.installationId,
        },
      });
    } else {
      return new Octokit({
        auth: this.config.token,
      });
    }
  }

  /**
   * Start polling for new commits (fallback if webhooks aren't available)
   */
  private startPolling(intervalMs: number = 30000): void {
    this.pollingInterval = setInterval(async () => {
      try {
        const latestCommit = await this.getLatestCommit();
        
        if (this.lastKnownSha && this.lastKnownSha !== latestCommit.sha) {
          this.emit('newCommit', latestCommit);
        }
        
        this.lastKnownSha = latestCommit.sha;
      } catch (error) {
        console.error('Error polling for commits:', error);
        this.emit('error', error);
      }
    }, intervalMs);
  }

  /**
   * Stop polling for commits
   */
  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Handle GitHub webhook events
   */
  public handleWebhook(req: Request, res: Response): void {
    const signature = req.headers['x-hub-signature-256'] as string;
    const payload = JSON.stringify(req.body);
    
    if (!this.verifyWebhookSignature(payload, signature)) {
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.headers['x-github-event'] as string;
    
    switch (event) {
      case 'push':
        this.handlePushEvent(req.body);
        break;
      case 'workflow_run':
        this.handleWorkflowRunEvent(req.body);
        break;
      case 'check_run':
        this.handleCheckRunEvent(req.body);
        break;
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.status(200).send('OK');
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(payload: string, signature: string): boolean {
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex')}`;
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle push webhook events
   */
  private handlePushEvent(payload: {
    ref: string;
    commits: CommitData[];
    head_commit: CommitData;
    repository: {
      [key: string]: unknown;
    };
  }): void {
    const { ref, commits, head_commit } = payload;
    const branch = ref.replace('refs/heads/', '');
    
    this.emit('push', {
      branch,
      commits,
      headCommit: head_commit,
      repository: payload.repository
    });

    // If push to default branch, trigger new commit event
    if (branch === this.config.defaultBranch) {
      this.emit('newCommit', head_commit);
    }
  }

  /**
   * Handle workflow run events
   */
  private handleWorkflowRunEvent(payload: { workflow_run: object; action: string }): void {
    const { workflow_run, action } = payload;
    
    this.emit('workflowRun', {
      action,
      workflowRun: workflow_run
    });
  }

  /**
   * Handle check run events
   */
  private handleCheckRunEvent(payload: { check_run: object; action: string }): void {
    const { check_run, action } = payload;
    
    this.emit('checkRun', {
      action,
      checkRun: check_run
    });
  }

  /**
   * Get the latest commit from the default branch
   */
  public async getLatestCommit(branch?: string): Promise<CommitData> {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner: this.config.owner,
        repo: this.config.repo,
        sha: branch || this.config.defaultBranch,
        per_page: 1
      });

      const commit = data[0];
      return {
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author?.name || '',
          email: commit.commit.author?.email || '',
          date: commit.commit.author?.date || ''
        },
        committer: {
          name: commit.commit.committer?.name || '',
          email: commit.commit.committer?.email || '',
          date: commit.commit.committer?.date || ''
        },
        url: commit.html_url
      };
    } catch (error: unknown) {
      console.error('Error fetching latest commit:', error);
      throw error;
    }
  }

  /**
   * Get recent commit history
   */
  public async getCommitHistory(branch?: string, limit: number = 10): Promise<CommitData[]> {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner: this.config.owner,
        repo: this.config.repo,
        sha: branch || this.config.defaultBranch,
        per_page: limit
      });

      return data.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author?.name || '',
          email: commit.commit.author?.email || '',
          date: commit.commit.author?.date || ''
        },
        committer: {
          name: commit.commit.committer?.name || '',
          email: commit.commit.committer?.email || '',
          date: commit.commit.committer?.date || ''
        },
        url: commit.html_url
      }));
    } catch (error: unknown) {
      console.error('Error fetching commit history:', error);
      throw error;
    }
  }

  /**
   * Get current branch information
   */
  public async getCurrentBranchInfo(): Promise<{
    name: string;
    latestCommit: CommitData;
    workflowStatus: WorkflowRun[];
    checkRuns: CheckRun[];
  }> {
    try {
      const latestCommit = await this.getLatestCommit();
      const workflowStatus = await this.getWorkflowRuns();
      const checkRuns = await this.getCheckRuns(latestCommit.sha);

      return {
        name: this.config.defaultBranch,
        latestCommit,
        workflowStatus,
        checkRuns
      };
    } catch (error: unknown) {
      console.error('Error fetching current branch info:', error);
      throw error;
    }
  }

  /**
   * Get workflow runs for the repository
   */
  public async getWorkflowRuns(branch?: string, limit: number = 10): Promise<WorkflowRun[]> {
    try {
      const params: { owner: string; repo: string; per_page: number; branch?: string } = {
        owner: this.config.owner,
        repo: this.config.repo,
        per_page: limit
      };

      if (branch) {
        params.branch = branch;
      }

      const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: params.owner,
        repo: params.repo,
        per_page: params.per_page,
        branch: params.branch
      });

      // Define a narrow type for the GitHub API workflow run object fields we read
      type GHWorkflowRun = {
        id: number;
        name?: string | null;
        status?: 'queued' | 'in_progress' | 'completed' | string | null;
        conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | null | string;
        head_branch?: string | null;
        head_sha: string;
        created_at?: string | null;
        updated_at?: string | null;
        html_url?: string | null;
      };

      return data.workflow_runs.map((run: GHWorkflowRun) => ({
        id: run.id,
        name: run.name ?? '',
        status: (run.status as WorkflowRun['status']) ?? 'queued',
        conclusion: (run.conclusion as WorkflowRun['conclusion']) ?? null,
        branch: run.head_branch ?? '',
        sha: run.head_sha,
        createdAt: run.created_at ?? '',
        updatedAt: run.updated_at ?? '',
        url: run.html_url ?? ''
      }));
    } catch (error: unknown) {
      console.error('Error fetching workflow runs:', error);
      throw error;
    }
  }

  /**
   * Get check runs for a specific commit
   */
  public async getCheckRuns(sha: string): Promise<CheckRun[]> {
    try {
      const { data } = await this.octokit.rest.checks.listForRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: sha
      });

      type GHCheckRun = {
        id: number;
        name: string;
        status?: 'queued' | 'in_progress' | 'completed' | string | null;
        conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null | string;
        head_sha: string;
        html_url?: string | null;
        started_at?: string | null;
        completed_at?: string | null;
      };

      return data.check_runs.map((run: GHCheckRun) => ({
        id: run.id,
        name: run.name,
        status: (run.status as CheckRun['status']) ?? 'queued',
        conclusion: (run.conclusion as CheckRun['conclusion']) ?? null,
        sha: run.head_sha,
        url: run.html_url ?? '',
        startedAt: run.started_at ?? null,
        completedAt: run.completed_at ?? null
      }));
    } catch (error: unknown) {
      console.error('Error fetching check runs:', error);
      throw error;
    }
  }

  /**
   * Get list of branches with ahead/behind information
   */
  public async getBranches(): Promise<BranchInfo[]> {
    try {
      const { data: branches } = await this.octokit.rest.repos.listBranches({
        owner: this.config.owner,
        repo: this.config.repo,
        protected: true
      });

      const branchesInfo: BranchInfo[] = [];

      for (const branch of branches) {
        try {
          // Get ahead/behind information compared to default branch
          const comparison = await this.octokit.rest.repos.compareCommits({
            owner: this.config.owner,
            repo: this.config.repo,
            base: this.config.defaultBranch,
            head: branch.name
          });

          branchesInfo.push({
            name: branch.name,
            sha: branch.commit.sha,
            protected: branch.protected,
            ahead: comparison.data.ahead_by,
            behind: comparison.data.behind_by
          });
  } catch {
          // If comparison fails, still include the branch
          branchesInfo.push({
            name: branch.name,
            sha: branch.commit.sha,
            protected: branch.protected,
            ahead: 0,
            behind: 0
          });
        }
      }

      return branchesInfo;
    } catch (error) {
      console.error('Error fetching branches:', error);
      throw error;
    }
  }

  /**
   * Create a deployment
   */
  public async createDeployment(
    sha: string,
    environment: string = 'vex-brain',
    description?: string
  ): Promise<DeploymentStatus> {
    try {
      const { data } = await this.octokit.rest.repos.createDeployment({
        owner: this.config.owner,
        repo: this.config.repo,
        ref: sha,
        environment,
        description: description || `Deploy ${sha.substring(0, 7)} to VEX Brain`,
        auto_merge: false,
        required_contexts: []
      });

      if ('id' in data && typeof data.id === 'number') {
        this.emit('deploymentCreated', {
          deploymentId: data.id,
          sha,
          environment
        });

        return {
          success: true,
          deploymentId: data.id
        };
      } else {
        const responseData = data as { message?: string } | undefined;
        const errorMsg = responseData?.message ?? 'Deployment creation failed: No deployment ID returned';
        console.error(errorMsg);
        return {
          success: false,
          error: errorMsg
        };
      }
    } catch (error) {
      console.error('Error creating deployment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Update deployment status
   */
  public async updateDeploymentStatus(
    deploymentId: number,
    state: 'pending' | 'success' | 'error' | 'failure',
    description?: string
  ): Promise<void> {
    try {
      await this.octokit.rest.repos.createDeploymentStatus({
        owner: this.config.owner,
        repo: this.config.repo,
        deployment_id: deploymentId,
        state,
        description,
        environment_url: process.env.DEPLOYMENT_URL
      });

      this.emit('deploymentStatusUpdated', {
        deploymentId,
        state,
        description
      });
    } catch (error) {
      console.error('Error updating deployment status:', error);
      throw error;
    }
  }

  /**
   * Pull latest changes (for git operations on the Pi)
   */
  public async pullLatestChanges(branch?: string): Promise<{
    success: boolean;
    commit?: CommitData;
    error?: string;
  }> {
    try {
      const latestCommit = await this.getLatestCommit(branch);
      
      // Emit event for external git pull operation
      this.emit('pullRequested', {
        branch: branch || this.config.defaultBranch,
        commit: latestCommit
      });

      return {
        success: true,
        commit: latestCommit
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get repository information
   */
  public async getRepositoryInfo(): Promise<{
    name: string;
    fullName: string;
    defaultBranch: string;
    cloneUrl: string;
    sshUrl: string;
    description?: string;
    private: boolean;
  }> {
    try {
      const { data } = await this.octokit.rest.repos.get({
        owner: this.config.owner,
        repo: this.config.repo
      });

      return {
        name: data.name,
        fullName: data.full_name,
        defaultBranch: data.default_branch,
        cloneUrl: data.clone_url,
        sshUrl: data.ssh_url,
        description: data.description || undefined,
        private: data.private
      };
    } catch (error) {
      console.error('Error fetching repository info:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopPolling();
    this.removeAllListeners();
  }
}

export default GitHubService;
export type { GitHubConfig, CommitData, BranchInfo, WorkflowRun, CheckRun, DeploymentStatus };