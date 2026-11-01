export type Corporation = 'Holding Headquarters' | 'Trading Corporation' | 'Development Corporation' | 'Marketing Corporation';
export type AgentStatus = 'Online' | 'Offline' | 'Working' | 'Busy' | 'Waiting for Approval' | 'Suspended' | 'Under Evaluation';
export type TaskStatus = 'Backlog' | 'Assigned' | 'In Progress' | 'Under Review' | 'Blocked' | 'Awaiting Approval' | 'Completed' | 'Cancelled';
export type Priority = 'Low' | 'Normal' | 'High' | 'Critical';
export type ConversationType = 'group' | 'dm';

export interface User {
  id: string;
  name: string;
  email: string;
  title: string;
  role: 'Owner' | 'Administrator' | 'Executive' | 'Manager' | 'Agent';
  avatarColor: string;
}

export interface Agent {
  id: string;
  name: string;
  title: string;
  corporation: Corporation;
  department: string;
  level: string;
  reportsTo: string | null;
  status: AgentStatus;
  responsibilities: string[];
  currentObjective: string;
  personalityInstructions: string;
  permissionLevel: string;
  avatarColor?: string;
  tools: string[];
  skills: string[];
  isExecutive: boolean;
  isDemoSeed?: boolean;
}

export interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  createdBy: string;
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderTitle: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  isPriority?: boolean;
  isPinned?: boolean;
  replyTo?: string;
  threadRootId?: string;
  reactions: Reaction[];
  attachments: Attachment[];
  mentions: string[];
  isDemoSeed?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  corporation: Corporation;
  department: string;
  category: string;
  participantIds: string[];
  unreadCount: number;
  archived?: boolean;
  isAnnouncement?: boolean;
  updatedAt: string;
  lastMessage?: Pick<Message, 'body' | 'senderName' | 'createdAt'>;
  isDemoSeed?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  corporation: Corporation;
  department: string;
  assigneeId: string | null;
  assigneeName: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  projectId?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  isDemoSeed?: boolean;
}

export interface Project {
  id: string;
  name: string;
  corporation: Corporation;
  department: string;
  status: string;
  description: string;
  ownerId: string;
  startDate?: string;
  targetDate?: string;
  isDemoSeed?: boolean;
}

export interface Approval {
  id: string;
  title: string;
  category: string;
  requesterId: string;
  requesterName: string;
  corporation: Corporation;
  description: string;
  justification: string;
  amount?: number;
  risk: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Changes Requested' | 'Delegated';
  evidence: string[];
  approvalChain: string[];
  createdAt: string;
  reviewedAt?: string;
  isDemoSeed?: boolean;
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  requesterName: string;
  corporation: Corporation;
  businessImpact: string;
  financialImpact: string;
  risk: string;
  status: 'Draft' | 'Under Review' | 'Awaiting Approval' | 'Approved' | 'Rejected' | 'Executing' | 'Completed';
  recommendations: string[];
  approvalRequired: boolean;
  createdAt: string;
  isDemoSeed?: boolean;
}

export interface CommandRun {
  id: string;
  command: string;
  route: string;
  status: 'Pending' | 'Processing' | 'Waiting for Approval' | 'Completed' | 'Failed';
  createdAt: string;
  updatedAt: string;
  requestedBy: string;
  result?: string;
  error?: string;
  providerRunId?: string;
}

export interface Meeting {
  id: string;
  title: string;
  type: string;
  objective: string;
  topics: string[];
  participantIds: string[];
  moderatorId: string;
  corporation: Corporation;
  scheduledAt: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
  notes: string[];
  isDemoSeed?: boolean;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface Notification {
  id: string;
  category: string;
  title: string;
  body: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  createdAt: string;
  readAt?: string;
  linkType?: string;
  linkId?: string;
  isDemoSeed?: boolean;
}

export interface Bootstrap {
  mode: 'demo' | 'production';
  aiProvider: { configured: boolean; provider: string; endpointConfigured: boolean };
  security: { authentication: string; mfaConfigured: boolean; encryptionAtRest: boolean; fileScanning: boolean };
  user: User;
  agents: Agent[];
  conversations: Conversation[];
  tasks: Task[];
  projects: Project[];
  approvals: Approval[];
  decisions: Decision[];
  meetings: Meeting[];
  commands: CommandRun[];
  notifications: Notification[];
  auditLogs: AuditEntry[];
  savedMessageIds: string[];
  notificationPreferences?: { inApp: boolean; email: boolean; securityAlerts: boolean; mentions: boolean; taskUpdates: boolean };
}

export type PageId =
  | 'overview' | 'conversations' | 'direct-messages' | 'group-chats' | 'announcements'
  | 'command-center' | 'meetings' | 'decisions' | 'approvals'
  | 'holding' | 'trading' | 'development' | 'marketing'
  | 'executive-board' | 'department-managers' | 'agent-directory' | 'agent-profile'
  | 'agent-recruitment' | 'organization-chart' | 'tasks' | 'projects' | 'workflow'
  | 'analytics' | 'finance' | 'security' | 'audit-logs' | 'my-tasks' | 'saved-messages'
  | 'notifications' | 'knowledge' | 'roles' | 'settings';
