"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Play, 
  GitBranch, 
  History, 
  Settings, 
  User, 
  Cpu, 
  HardDrive, 
  Battery, 
  Wifi, 
  Download, 
  RotateCcw,
  CheckCircle,
  XCircle,
  Loader2,
  Pause,
  Search,
  Eye,
  EyeOff
} from 'lucide-react';
import { Analytics } from "@vercel/analytics/next";

// Mock data and types
interface User {
  id: string;
  name: string;
  role: 'admin' | 'viewer';
  avatar?: string;
}

interface Build {
  id: string;
  commit: string;
  author: string;
  branch: string;
  timestamp: string;
  status: 'success' | 'failed' | 'building';
  message: string;
}

interface SystemStatus {
  pi: {
    cpu: number;
    memory: number;
    disk: number;
  };
  brain: {
    connected: boolean;
    battery: number;
    lastHeartbeat: string;
  };
  network: {
    tailscale: boolean;
  };
}

const VEXDashboard = () => {
  // TODO: Make this Dynamic
  const [currentUser] = useState<User>({ 
    id: '1', 
    name: 'Developer', 
    role: 'admin',
    avatar: '👨‍💻'
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [buildMode, setBuildMode] = useState<'debug' | 'release'>('release');
  const [cleanBuild, setCleanBuild] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [logsPaused, setLogsPaused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [logLevel, setLogLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  
  const terminalRef = useRef<HTMLDivElement>(null);
  
  // TODO: Replace with actual API Calls 
  const [systemStatus] = useState<SystemStatus>({
    pi: { cpu: 45, memory: 68, disk: 23 },
    brain: { connected: true, battery: 87, lastHeartbeat: '2 seconds ago' },
    network: { tailscale: true }
  });
  // Build history will be populated from GitHub API
  const [buildHistory, setBuildHistory] = useState<Build[]>([]);

  // Repository and branches from GitHub
  const [branches, setBranches] = useState<string[]>([]);
  const [repoInfo, setRepoInfo] = useState<{ name?: string; fullName?: string; description?: string } | null>(null);

  // GitHub repository to read from. Prefer environment variables; fall back to example repo used in the UI.
  const GITHUB_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER || 'team';
  const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'vex-robot';

  type GHCommit = {
    sha: string;
    commit: { author?: { name?: string; date?: string }; message?: string };
    author?: { login?: string } | null;
    html_url?: string;
  };

  async function fetchBranches() {
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches`);
      if (!res.ok) throw new Error(`Branches request failed: ${res.status}`);
      const data: Array<{ name: string }> = await res.json();
      const names = data.map((b) => b.name);
      setBranches(names);
      if (names.length > 0 && !branches.includes(selectedBranch)) {
        setSelectedBranch(names[0]);
      }
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  }

  async function fetchRepoInfo() {
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`);
      if (!res.ok) throw new Error(`Repo request failed: ${res.status}`);
      const data = await res.json();
      setRepoInfo({ name: data.name, fullName: data.full_name, description: data.description });
    } catch (err) {
      console.error('Error fetching repo info:', err);
    }
  }

  const fetchCommits = React.useCallback(async (branch: string, limit: number = 10) => {
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`);
      if (!res.ok) throw new Error(`Commits request failed: ${res.status}`);
      const data: GHCommit[] = await res.json();

      const commits: Build[] = data.map((c) => ({
        id: c.sha,
        commit: c.sha.substring(0, 7),
        author: c.commit?.author?.name || c.author?.login || 'unknown',
        branch,
        timestamp: c.commit?.author?.date || new Date().toISOString(),
        status: 'success',
        message: c.commit?.message || ''
      }));

    setBuildHistory(commits);
    } catch (err) {
      console.error('Error fetching commits:', err);
    }
  }, [GITHUB_OWNER, GITHUB_REPO]);

  // (helper removed) - use fetchCommits to populate build history

  // Fetch repo/branches/commits on mount and when selectedBranch changes
  useEffect(() => {
    fetchRepoInfo();
    fetchBranches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedBranch) fetchCommits(selectedBranch, 10);
  }, [selectedBranch, fetchCommits]);
  
  const [logs, setLogs] = useState([
    '[INFO] Brain connected successfully',
    '[DEBUG] Motor 1 initialized at port 1',
    '[INFO] Autonomous routine started',
    '[WARN] Battery level at 87%',
    '[DEBUG] Sensor reading: 1024',
    '[INFO] Competition mode enabled'
  ]);

  // Mock WebSocket for live logs
  useEffect(() => {
    if (!logsPaused) {
      const interval = setInterval(() => {
        const logTypes = ['INFO', 'DEBUG', 'WARN', 'ERROR'];
        const messages = [
          'Motor speed updated',
          'Sensor data received',
          'Battery check complete',
          'Competition state changed',
          'Autonomous sequence running',
          'Drive train operational'
        ];
        
        const newLog = `[${logTypes[Math.floor(Math.random() * logTypes.length)]}] ${messages[Math.floor(Math.random() * messages.length)]}`;
        setLogs(prev => [...prev.slice(-50), newLog]);
      }, 2000);
      
      return () => clearInterval(interval);
    }
    return undefined;
  }, [logsPaused]);

  // TODO: Replace with GitHub API Calls
  const handleDeploy = async () => {
    setIsDeploying(true);
    // Simulate deployment
    setTimeout(() => {
      setIsDeploying(false);
    }, 3000);
  };

  const handleRollback = (buildId: string) => {
    console.log(`Rolling back to build ${buildId}`);
  };

  const StatusCard = ({ title, value, icon: Icon, status }: {
    title: string;
    value: string | number;
    icon: React.ElementType;
    status?: 'good' | 'warning' | 'error';
  }) => (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <Icon className={`w-8 h-8 ${
          status === 'good' ? 'text-green-500' : 
          status === 'warning' ? 'text-yellow-500' : 
          status === 'error' ? 'text-red-500' : 'text-blue-500'
        }`} />
      </div>
    </div>
  );

  const DashboardView = () => (
    
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard 
          title="CPU Usage" 
          value={`${systemStatus.pi.cpu}%`} 
          icon={Cpu} 
          status={systemStatus.pi.cpu > 80 ? 'error' : systemStatus.pi.cpu > 60 ? 'warning' : 'good'}
        />
        <StatusCard 
          title="Memory Usage" 
          value={`${systemStatus.pi.memory}%`} 
          icon={HardDrive} 
          status={systemStatus.pi.memory > 80 ? 'error' : systemStatus.pi.memory > 60 ? 'warning' : 'good'}
        />
        <StatusCard 
          title="Brain Battery" 
          value={`${systemStatus.brain.battery}%`} 
          icon={Battery} 
          status={systemStatus.brain.battery < 20 ? 'error' : systemStatus.brain.battery < 50 ? 'warning' : 'good'}
        />
        <StatusCard 
          title="Network" 
          value={systemStatus.network.tailscale ? "Connected" : "Disconnected"} 
          icon={Wifi} 
          status={systemStatus.network.tailscale ? 'good' : 'error'}
        />
      </div>

      {/* Deployment Controls */}
      {currentUser.role === 'admin' && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Deployment Controls</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
              <select 
                value={selectedBranch} 
                onChange={(e) => setSelectedBranch((e.target as HTMLSelectElement).value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {branches.length > 0 ? (
                  branches.map(b => <option key={b} value={b}>{b}</option>)
                ) : (
                  <option value={selectedBranch}>{selectedBranch}</option>
                )}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Build Mode</label>
              <select 
                value={buildMode} 
                onChange={(e) => setBuildMode(e.target.value as 'debug' | 'release')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="release">Release</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <label className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={cleanBuild} 
                  onChange={(e) => setCleanBuild(e.target.checked)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Clean Build</span>
              </label>
            </div>
          </div>
          
          <button
            onClick={handleDeploy}
            disabled={isDeploying}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isDeploying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Deploy Latest
              </>
            )}
          </button>
        </div>
      )}

      {/* Live Console */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Live Console</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setLogsPaused(!logsPaused)}
              className="inline-flex items-center px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              {logsPaused ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
              {logsPaused ? 'Resume' : 'Pause'}
            </button>
            <button className="inline-flex items-center px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md">
              <Download className="w-4 h-4 mr-1" />
              Download
            </button>
          </div>
        </div>
        
        <div className="p-4">
          <div 
            ref={terminalRef}
            className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm h-64 overflow-y-auto"
          >
            {logs.map((log, index) => (
              <div key={index} className="mb-1">{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const DeployView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Deploy Code</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Repository Branch</label>
            <div className="flex items-center space-x-2">
              <GitBranch className="w-4 h-4 text-gray-400" />
              <select 
                value={selectedBranch} 
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {branches.length > 0 ? branches.map(b => <option key={b} value={b}>{b}</option>) : <option value={selectedBranch}>{selectedBranch}</option>}
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Build Configuration</label>
            <div className="space-y-2">
              <select 
                value={buildMode} 
                onChange={(e) => setBuildMode(e.target.value as 'debug' | 'release')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="release">Release Build</option>
                <option value="debug">Debug Build</option>
              </select>
              
              <label className="flex items-center">
                <input 
                  type="checkbox" 
                  checked={cleanBuild} 
                  onChange={(e) => setCleanBuild(e.target.checked)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Clean build (rebuild all)</span>
              </label>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-4">
          <button
            onClick={handleDeploy}
            disabled={isDeploying || currentUser.role !== 'admin'}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isDeploying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Building & Deploying...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Deploy to Brain
              </>
            )}
          </button>
        </div>
      </div>

      {/* Build Output */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Build Output</h3>
        </div>
        
        <div className="p-4">
          <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm h-96 overflow-y-auto">
            {isDeploying ? (
              <div className="space-y-1">
                <div>Starting deployment...</div>
                <div>Pulling latest from {selectedBranch} branch...</div>
                <div>Running git pull origin {selectedBranch}...</div>
                <div>Building project in {buildMode} mode...</div>
                <div className="text-yellow-400">Compiling source files...</div>
                <div className="animate-pulse">● Building...</div>
              </div>
            ) : (
              <div className="text-gray-500">Build output will appear here...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const HistoryView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Build History</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Branch</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Author</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {buildHistory.map((build) => (
                <tr key={build.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {build.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : build.status === 'failed' ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{build.commit}</div>
                      <div className="text-sm text-gray-500">{build.message}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {build.branch}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{build.author}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(build.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {currentUser.role === 'admin' && build.status === 'success' && (
                        <button
                          onClick={() => handleRollback(build.id)}
                          className="inline-flex items-center px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Rollback
                        </button>
                      )}
                      <button className="inline-flex items-center px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md">
                        <Download className="w-3 h-3 mr-1" />
                        Binary
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const LogsView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Runtime Logs</h2>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <select
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value as 'all' | 'info' | 'warn' | 'error')}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warn">Warnings</option>
                <option value="error">Errors</option>
              </select>
              
              <button
                onClick={() => setLogsPaused(!logsPaused)}
                className="inline-flex items-center px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                {logsPaused ? <Eye className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
                {logsPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-4">
          <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm h-96 overflow-y-auto">
            {logs
              .filter(log => {
                if (logLevel === 'all') return true;
                return log.toLowerCase().includes(`[${logLevel}]`);
              })
              .filter(log => searchTerm === '' || log.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((log, index) => (
                <div key={index} className="mb-1 hover:bg-gray-800 px-2 py-1 rounded">
                  <span className="text-gray-500 text-xs mr-2">
                    {new Date().toLocaleTimeString()}
                  </span>
                  {log}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Settings</h2>
        
        <div className="space-y-8">
          {/* GitHub Settings */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">GitHub Repository</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Repository URL</label>
                <input
                  type="text"
                  defaultValue="https://github.com/team/vex-robot"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Default Branch</label>
                <input
                  type="text"
                  defaultValue="main"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
          
          {/* Notifications */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Notifications</h3>
            <div className="space-y-4">
              <label className="flex items-center">
                <input type="checkbox" className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">Send Slack notifications for deployments</span>
              </label>
              <div className="ml-6">
                <input
                  type="text"
                  placeholder="Slack webhook URL"
                  className="w-full max-w-md px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
          
          {/* User Management */}
          {currentUser.role === 'admin' && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">User Management</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Current Users</span>
                  <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Add User
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center">
                      <span className="mr-3">👨‍💻</span>
                      <span>Developer (Admin)</span>
                    </div>
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-8 flex space-x-4">
          <button className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            Save Settings
          </button>
          <button className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500">
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: Terminal },
    { id: 'deploy', name: 'Deploy', icon: Play },
    { id: 'history', name: 'History', icon: History },
    { id: 'logs', name: 'Logs', icon: Terminal },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <Terminal className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">VEX Deployment Dashboard</h1>
                {repoInfo && (
                  <div className="text-sm text-gray-500">Repo: {repoInfo.fullName}</div>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${systemStatus.brain.connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <span className="text-sm text-gray-600">
                  Brain {systemStatus.brain.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{currentUser.name}</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                  {currentUser.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === item.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'deploy' && <DeployView />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'logs' && <LogsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
      <Analytics />
    </div>
  );
}

export default VEXDashboard;