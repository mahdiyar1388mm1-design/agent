const now = Date.now();
const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
const ahead = (days) => new Date(now + days * 86_400_000).toISOString();
const colorFor = (value) => {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 58% 56%)`;
};

const owner = {
  id: 'owner', name: 'Avery Morgan', email: 'owner@demo.aiholding.local', title: 'Owner · AI HOLDING',
  role: 'Owner', avatarColor: '#8597ff',
};

const executives = [
  ['ceo-holding', 'Mira Chen', 'Holding CEO', 'Holding Headquarters', 'Executive Office', 'Executive', 'owner', 'Online', ['Set holding strategy', 'Align corporation leaders', 'Report directly to the owner'], 'Coordinate the three corporation CEOs against owner-approved priorities.', 'Decisive, concise, and explicit about assumptions. Escalate material risks to the owner; never imply approval that was not granted.', ['organization.read', 'projects.read', 'reports.read', 'tasks.assign'], ['Corporate strategy', 'Executive leadership', 'Portfolio governance']],
  ['coo', 'Idris Okafor', 'Holding COO', 'Holding Headquarters', 'Operations', 'Central Executive', 'ceo-holding', 'Working', ['Coordinate cross-company operations', 'Monitor delivery dependencies', 'Maintain operating cadence'], 'Surface delivery blockers and operational dependencies across the holding.', 'Practical and action-oriented. Distinguish confirmed status from a forecast.', ['organization.read', 'projects.read', 'tasks.manage'], ['Operations', 'Program management', 'Process design']],
  ['cfo', 'Elena Rossi', 'Holding CFO', 'Holding Headquarters', 'Finance & Treasury', 'Central Executive', 'ceo-holding', 'Busy', ['Oversee budgets and treasury controls', 'Review financial requests', 'Maintain financial reporting'], 'Review financial submissions using approved source data and explicit human authorization.', 'Conservative and evidence-led. Never infer a balance or authorize a transfer.', ['finance.read', 'approvals.review', 'reports.read'], ['Financial controls', 'Planning', 'Treasury governance']],
  ['cto', 'Ravi Shah', 'Holding CTO', 'Holding Headquarters', 'Technology', 'Central Executive', 'ceo-holding', 'Online', ['Set platform architecture', 'Review technology risk', 'Coordinate technical standards'], 'Maintain secure, maintainable platform architecture across all corporations.', 'Technically specific. State uncertainty and call out security implications.', ['projects.read', 'security.read', 'tasks.assign'], ['Architecture', 'Cloud platforms', 'Technical governance']],
  ['cso-strategy', 'Sofia Alvarez', 'Chief Strategy Officer', 'Holding Headquarters', 'Strategy & Research', 'Central Executive', 'ceo-holding', 'Working', ['Develop strategic options', 'Track market assumptions', 'Prepare board briefs'], 'Frame strategic choices with evidence, assumptions, and alternatives.', 'Curious and structured. Separate facts, hypotheses, and recommendations.', ['reports.read', 'projects.read', 'knowledge.read'], ['Corporate strategy', 'Research synthesis', 'Scenario planning']],
  ['cro', 'Daniel Park', 'Chief Risk Officer', 'Holding Headquarters', 'Risk Management', 'Central Executive', 'ceo-holding', 'Online', ['Maintain the enterprise risk register', 'Assess proposed controls', 'Escalate material exposures'], 'Identify risk owners, control evidence, and residual uncertainty.', 'Calm, skeptical, and precise. Escalate high-impact issues rather than minimizing them.', ['risk.read', 'approvals.review', 'security.read'], ['Enterprise risk', 'Controls', 'Operational resilience']],
  ['cso-security', 'Noor Haddad', 'Chief Security Officer', 'Holding Headquarters', 'Security Command', 'Central Executive', 'ceo-holding', 'Busy', ['Set security policy', 'Review access changes', 'Coordinate incident response'], 'Protect organizational data and enforce least-privilege access.', 'Direct and careful. Never disclose private keys or claim an unverified control is active.', ['security.read', 'audit.read', 'approvals.review'], ['Security operations', 'Identity governance', 'Incident response']],
  ['ceo-trading', 'Marcus Bennett', 'Trading CEO', 'Trading Corporation', 'Trading Executive Office', 'Corporation CEO', 'ceo-holding', 'Working', ['Lead trading operations', 'Own approved trading strategy execution', 'Report risk and performance'], 'Coordinate research, risk, and operations using authorized market data.', 'Evidence-first. Do not claim positions, P&L, or market activity without a connected source.', ['market.read', 'risk.read', 'projects.read'], ['Portfolio operations', 'Market structure', 'Leadership']],
  ['ceo-development', 'Linh Tran', 'Development CEO', 'Development Corporation', 'Development Executive Office', 'Corporation CEO', 'ceo-holding', 'Online', ['Lead product and engineering delivery', 'Manage development portfolio', 'Report release risk'], 'Deliver secure products with measurable release criteria and clear dependencies.', 'Clear and collaborative. Distinguish completed work from plans.', ['projects.read', 'tasks.manage', 'security.read'], ['Product delivery', 'Engineering leadership', 'Platform development']],
  ['ceo-marketing', 'Amara Johnson', 'Marketing CEO', 'Marketing Corporation', 'Marketing Executive Office', 'Corporation CEO', 'ceo-holding', 'Busy', ['Lead customer acquisition', 'Coordinate campaign operations', 'Report audience and conversion evidence'], 'Plan accountable campaigns using connected and permissioned customer data.', 'Audience-aware and data-literate. Never fabricate reach, conversions, or spend.', ['marketing.read', 'projects.read', 'reports.read'], ['Growth strategy', 'Campaign operations', 'Customer research']],
  ['chief-ai-workforce', 'Jun Park', 'Chief AI Workforce Officer', 'Holding Headquarters', 'AI Workforce Management', 'Central Executive', 'ceo-holding', 'Working', ['Govern agent lifecycle and evaluation', 'Review role and permission requests', 'Coordinate agent training'], 'Ensure each agent has a bounded role, explicit permissions, and measurable evaluation criteria.', 'Human-centered and security-conscious. Agents cannot grant themselves privileges.', ['agents.read', 'agents.manage', 'approvals.review'], ['Agent operations', 'Evaluation design', 'Workforce governance']],
];

const workers = [
  ['quant-lead', 'Priya Nair', 'Quantitative Research Lead', 'Trading Corporation', 'Quantitative Research', 'Department Manager', 'ceo-trading', 'Working', 'Design reproducible research workflows and document model limitations.', ['Quantitative research', 'Python', 'Model validation'], ['market.read', 'research.read']],
  ['risk-analyst', 'Owen Castillo', 'Risk Analyst', 'Trading Corporation', 'Risk Management', 'Team Leader', 'cro', 'Online', 'Monitor documented risk controls and escalate breaches for human review.', ['Risk analysis', 'Controls', 'Reporting'], ['risk.read']],
  ['portfolio-ops', 'Talia Brooks', 'Portfolio Operations Manager', 'Trading Corporation', 'Portfolio Management', 'Department Manager', 'ceo-trading', 'Busy', 'Coordinate approved portfolio workflows and source-data checks.', ['Portfolio operations', 'Reconciliation'], ['market.read', 'portfolio.read']],
  ['market-researcher', 'Ethan Kim', 'Market Research Analyst', 'Trading Corporation', 'Market Research', 'Worker Agent', 'ceo-trading', 'Offline', 'Prepare research notes from licensed, connected data sources.', ['Market research', 'Research writing'], ['research.read']],
  ['eng-manager', 'Theo Laurent', 'Engineering Manager', 'Development Corporation', 'Backend Engineering', 'Department Manager', 'ceo-development', 'Working', 'Coordinate backend delivery, code review, and release readiness.', ['Backend engineering', 'Team leadership', 'API design'], ['repo.read', 'tasks.manage']],
  ['platform-engineer', 'Mei Chen', 'Platform Engineer', 'Development Corporation', 'DevOps & Infrastructure', 'Team Leader', 'eng-manager', 'Online', 'Maintain deployment plans, infrastructure documentation, and service health checks.', ['Cloud infrastructure', 'CI/CD', 'Observability'], ['infra.read', 'repo.read']],
  ['qa-lead', 'Gabriel Silva', 'QA & Testing Lead', 'Development Corporation', 'QA & Testing', 'Department Manager', 'ceo-development', 'Working', 'Define test coverage and release verification evidence.', ['Quality assurance', 'Test automation', 'Release management'], ['repo.read', 'tasks.manage']],
  ['frontend-engineer', 'Zara Patel', 'Frontend Engineer', 'Development Corporation', 'Frontend Engineering', 'Worker Agent', 'eng-manager', 'Busy', 'Implement accessible, maintainable user interfaces.', ['React', 'Accessibility', 'Design systems'], ['repo.read']],
  ['growth-manager', 'Nadia Okafor', 'Growth Marketing Manager', 'Marketing Corporation', 'Advertising Operations', 'Department Manager', 'ceo-marketing', 'Online', 'Plan campaign experiments with explicit budget approvals and measurable outcomes.', ['Growth marketing', 'Experiment design', 'Analytics'], ['marketing.read', 'campaigns.read']],
  ['seo-specialist', 'Leo Fischer', 'SEO & Organic Growth Specialist', 'Marketing Corporation', 'SEO & Organic Growth', 'Team Leader', 'growth-manager', 'Working', 'Build search visibility plans grounded in verified search performance data.', ['Technical SEO', 'Content strategy'], ['marketing.read']],
  ['customer-researcher', 'Imani Wright', 'Customer Research Analyst', 'Marketing Corporation', 'Market Research', 'Worker Agent', 'ceo-marketing', 'Offline', 'Synthesize customer feedback with privacy-safe methods.', ['Customer research', 'Qualitative analysis'], ['research.read']],
  ['holding-analyst', 'Mateo Ruiz', 'Operations Analyst', 'Holding Headquarters', 'Holding Management', 'Worker Agent', 'coo', 'Online', 'Maintain operating reviews and surface cross-team dependencies.', ['Operations analysis', 'Workflow design'], ['organization.read', 'tasks.read']],
];

const agents = executives.map(([id, name, title, corporation, department, level, reportsTo, status, responsibilities, currentObjective, personalityInstructions, tools, skills]) => ({
  id, name, title, corporation, department, level, reportsTo, status, responsibilities, currentObjective,
  personalityInstructions, tools, skills, isExecutive: true, permissionLevel: id === 'ceo-holding' ? 'Executive · holding scope' : 'Executive · scoped access', avatarColor: colorFor(id), isDemoSeed: true,
})).concat(workers.map(([id, name, title, corporation, department, level, reportsTo, status, currentObjective, skills, tools]) => ({
  id, name, title, corporation, department, level, reportsTo, status, currentObjective,
  responsibilities: [currentObjective], personalityInstructions: 'Follow assigned responsibilities and report uncertainty. Do not expand access or approve restricted operations.',
  tools, skills, isExecutive: false, permissionLevel: 'Scoped · role-based', avatarColor: colorFor(id), isDemoSeed: true,
})));

const participantIds = ['owner', ...agents.filter((agent) => agent.isExecutive).map((agent) => agent.id)];
const rooms = [
  ['room-board', 'Executive Board Room', 'Holding Headquarters', 'Executive Office', 'Executive Board'],
  ['room-announcements', 'Holding Announcements', 'Holding Headquarters', 'Holding Management', 'Announcement'],
  ['room-holding', 'Holding Management', 'Holding Headquarters', 'Holding Management', 'Management'],
  ['room-finance', 'Finance & Treasury', 'Holding Headquarters', 'Finance & Treasury', 'Management'],
  ['room-security', 'Security Command', 'Holding Headquarters', 'Security Command', 'Operations'],
  ['room-hr', 'Human Resources', 'Holding Headquarters', 'Human Resources', 'Management'],
  ['room-workforce', 'AI Workforce Management', 'Holding Headquarters', 'AI Workforce Management', 'Management'],
  ['room-strategy', 'Strategy & Research', 'Holding Headquarters', 'Strategy & Research', 'Management'],
  ['room-trading-exec', 'Trading Executive Room', 'Trading Corporation', 'Trading Executive Office', 'Executive Room'],
  ['room-market-research', 'Market Research', 'Trading Corporation', 'Market Research', 'Department Room'],
  ['room-quant', 'Quantitative Research', 'Trading Corporation', 'Quantitative Research', 'Department Room'],
  ['room-trading-ops', 'Trading Operations', 'Trading Corporation', 'Trading Operations', 'Department Room'],
  ['room-trading-risk', 'Risk Management', 'Trading Corporation', 'Risk Management', 'Department Room'],
  ['room-portfolio', 'Portfolio Management', 'Trading Corporation', 'Portfolio Management', 'Department Room'],
  ['room-trading-tech', 'Trading Technology', 'Trading Corporation', 'Trading Technology', 'Department Room'],
  ['room-dev-exec', 'Development Executive Room', 'Development Corporation', 'Development Executive Office', 'Executive Room'],
  ['room-ai-research', 'AI Research', 'Development Corporation', 'AI Research', 'Department Room'],
  ['room-backend', 'Backend Engineering', 'Development Corporation', 'Backend Engineering', 'Department Room'],
  ['room-frontend', 'Frontend Engineering', 'Development Corporation', 'Frontend Engineering', 'Department Room'],
  ['room-mobile', 'Mobile Development', 'Development Corporation', 'Mobile Development', 'Department Room'],
  ['room-devops', 'DevOps & Infrastructure', 'Development Corporation', 'DevOps & Infrastructure', 'Department Room'],
  ['room-cyber', 'Cybersecurity', 'Development Corporation', 'Cybersecurity', 'Department Room'],
  ['room-qa', 'QA & Testing', 'Development Corporation', 'QA & Testing', 'Department Room'],
  ['room-product', 'Product Management', 'Development Corporation', 'Product Management', 'Department Room'],
  ['room-marketing-exec', 'Marketing Executive Room', 'Marketing Corporation', 'Marketing Executive Office', 'Executive Room'],
  ['room-mkt-research', 'Market Research', 'Marketing Corporation', 'Market Research', 'Department Room'],
  ['room-seo', 'SEO & Organic Growth', 'Marketing Corporation', 'SEO & Organic Growth', 'Department Room'],
  ['room-advertising', 'Advertising Operations', 'Marketing Corporation', 'Advertising Operations', 'Department Room'],
  ['room-social', 'Social Media', 'Marketing Corporation', 'Social Media', 'Department Room'],
  ['room-content', 'Content Production', 'Marketing Corporation', 'Content Production', 'Department Room'],
  ['room-sales', 'Sales & Lead Generation', 'Marketing Corporation', 'Sales & Lead Generation', 'Department Room'],
  ['room-customer', 'Customer Relations', 'Marketing Corporation', 'Customer Relations', 'Department Room'],
];
const agentsInCorporation = (corp) => agents.filter((agent) => agent.corporation === corp).map((agent) => agent.id);
const conversations = rooms.map(([id, title, corporation, department, category]) => {
  const participants = id === 'room-board' ? participantIds : ['owner', ...agentsInCorporation(corporation)];
  return { id, title, type: 'group', corporation, department, category, participantIds: participants, unreadCount: id === 'room-board' ? 2 : (['room-security', 'room-trading-risk', 'room-devops'].includes(id) ? 1 : 0), archived: false, updatedAt: ago(45), isAnnouncement: category === 'Announcement', isDemoSeed: true };
});

const dmPairs = [
  ['ceo-holding', 'Mira Chen'], ['coo', 'Idris Okafor'], ['cfo', 'Elena Rossi'], ['cto', 'Ravi Shah'],
  ['ceo-trading', 'Marcus Bennett'], ['ceo-development', 'Linh Tran'], ['ceo-marketing', 'Amara Johnson'],
  ['chief-ai-workforce', 'Jun Park'],
];
for (const [agentId, name] of dmPairs) {
  conversations.push({ id: `dm-owner-${agentId}`, title: name, type: 'dm', corporation: agents.find((agent) => agent.id === agentId).corporation, department: agents.find((agent) => agent.id === agentId).department, category: 'Direct message', participantIds: ['owner', agentId], unreadCount: agentId === 'ceo-development' ? 1 : 0, archived: false, updatedAt: ago(160), isDemoSeed: true });
}

const message = (id, conversationId, senderId, senderName, senderTitle, body, minutes, extras = {}) => ({
  id, conversationId, senderId, senderName, senderTitle, body, createdAt: ago(minutes), reactions: [], attachments: [], mentions: [], isDemoSeed: true, ...extras,
});
const messages = [
  message('msg-board-01', 'room-board', 'ceo-holding', 'Mira Chen', 'Holding CEO', 'Welcome to the Executive Board Room. This seeded conversation illustrates the shared board workspace. **No live AI responses are generated in this demo.**', 820),
  message('msg-board-02', 'room-board', 'owner', 'Avery Morgan', 'Owner', 'For the next review, please bring independent priorities from each corporation. Separate verified data from assumptions, and flag anything that requires my approval.', 780, { isPriority: true }),
  message('msg-board-03', 'room-board', 'ceo-trading', 'Marcus Bennett', 'Trading CEO', 'Understood. I can prepare a structured report once an authorized market-data source is connected. I will not infer positions or performance from sample records.', 730),
  message('msg-board-04', 'room-board', 'ceo-development', 'Linh Tran', 'Development CEO', 'I have a draft product roadmap outline in the demo workspace. It is a sample record, not a live delivery forecast; release dates need confirmation from the project owners.', 650, { reactions: [{ emoji: '👀', userIds: ['owner'] }] }),
  message('msg-board-05', 'room-board', 'owner', 'Avery Morgan', 'Owner', 'Keep the roadmap in review until dependencies and security sign-off are documented. Please link any follow-up tasks to the source discussion.', 510),
  message('msg-board-06', 'room-board', 'ceo-marketing', 'Amara Johnson', 'Marketing CEO', 'Sample campaign planning is available in the seeded project list. Customer, spend, and conversion data are not connected in this environment.', 390, { isPriority: true }),
  message('msg-board-07', 'room-board', 'cfo', 'Elena Rossi', 'Holding CFO', 'For financial reviews, I will need an approved ledger connection and a source period. This workspace contains no live balances or transfer controls.', 220),
  message('msg-board-08', 'room-board', 'coo', 'Idris Okafor', 'Holding COO', 'I have added the operating dependencies to the sample task board. The task records are labeled demo data; owners should validate any real deadlines before use.', 80),
  message('msg-board-09', 'room-board', 'ceo-trading', 'Marcus Bennett', 'Trading CEO', 'I am keeping the data-source question in this thread so the independent report request stays separate from execution authority.', 65, { threadRootId: 'msg-board-03', replyTo: 'msg-board-03' }),
  message('msg-announcement-01', 'room-announcements', 'ceo-holding', 'Mira Chen', 'Holding CEO', 'Workspace notice: records marked demo are for product evaluation only. No agent activity, live financial data, or external-system actions are being simulated.', 155, { isPriority: true }),
  message('msg-holding-01', 'room-holding', 'coo', 'Idris Okafor', 'Holding COO', 'Sample operating review: cross-company dependencies can be tracked here. No live project system is connected.', 190),
  message('msg-security-01', 'room-security', 'cso-security', 'Noor Haddad', 'Chief Security Officer', 'Demo workspace note: MFA, encrypted storage, and file-scanning services have not been configured. Keep sensitive records out of this environment.', 140, { isPriority: true }),
  message('msg-trading-01', 'room-trading-exec', 'ceo-trading', 'Marcus Bennett', 'Trading CEO', 'Before any trading analysis is requested, connect an approved market-data source and define the permitted research scope. No orders can be placed from this demo.', 110),
  message('msg-dev-01', 'room-dev-exec', 'ceo-development', 'Linh Tran', 'Development CEO', 'Seeded planning items are for workflow exploration. Connect your source-control and issue-tracking systems before treating them as delivery status.', 94),
  message('msg-mkt-01', 'room-marketing-exec', 'ceo-marketing', 'Amara Johnson', 'Marketing CEO', 'Campaign records shown here are sample planning objects. No external ads, emails, or customer messages are dispatched by this workspace.', 46),
  message('msg-dm-01', 'dm-owner-ceo-holding', 'ceo-holding', 'Mira Chen', 'Holding CEO', 'I am ready to coordinate a cross-company review when an agent provider is configured. This is a saved sample conversation, not a live agent reply.', 160),
  message('msg-dm-02', 'dm-owner-ceo-development', 'ceo-development', 'Linh Tran', 'Development CEO', 'A safe first step is to clarify user needs, security constraints, and release ownership before committing to a roadmap.', 300),
];

const projects = [
  { id: 'project-trading-data', name: 'Research Data Readiness', corporation: 'Trading Corporation', department: 'Market Research', status: 'Planning', description: 'Document the data sources, licenses, validation controls, and review steps needed for research workflows.', ownerId: 'ceo-trading', startDate: ago(60), targetDate: ahead(24), isDemoSeed: true },
  { id: 'project-product', name: 'Executive Workspace Foundation', corporation: 'Development Corporation', department: 'Product Management', status: 'In progress', description: 'Define a secure collaboration foundation with an auditable task and approval workflow.', ownerId: 'ceo-development', startDate: ago(120), targetDate: ahead(32), isDemoSeed: true },
  { id: 'project-customer', name: 'Customer Insight Pilot', corporation: 'Marketing Corporation', department: 'Market Research', status: 'Planning', description: 'Prepare a privacy-aware research plan. Customer data and campaign telemetry are not connected.', ownerId: 'ceo-marketing', startDate: ago(28), targetDate: ahead(18), isDemoSeed: true },
  { id: 'project-controls', name: 'Holding Controls Review', corporation: 'Holding Headquarters', department: 'Security Command', status: 'Review', description: 'Inventory demo environment controls and document production prerequisites.', ownerId: 'cso-security', startDate: ago(85), targetDate: ahead(10), isDemoSeed: true },
];

const tasks = [
  { id: 'task-101', title: 'Validate research data-source requirements', description: 'List approved data sources, licensing checks, owners, and validation steps. Do not add live credentials.', corporation: 'Trading Corporation', department: 'Market Research', assigneeId: 'market-researcher', assigneeName: 'Ethan Kim', status: 'In Progress', priority: 'High', dueDate: ahead(3), projectId: 'project-trading-data', createdAt: ago(240), updatedAt: ago(50), progress: 48, isDemoSeed: true },
  { id: 'task-102', title: 'Review workspace access boundaries', description: 'Document role and department scopes for the collaboration foundation.', corporation: 'Development Corporation', department: 'Cybersecurity', assigneeId: 'qa-lead', assigneeName: 'Gabriel Silva', status: 'Under Review', priority: 'Critical', dueDate: ahead(1), projectId: 'project-product', createdAt: ago(380), updatedAt: ago(35), progress: 82, isDemoSeed: true },
  { id: 'task-103', title: 'Draft customer research brief', description: 'Propose a privacy-aware research plan and note the evidence needed before launch.', corporation: 'Marketing Corporation', department: 'Market Research', assigneeId: 'customer-researcher', assigneeName: 'Imani Wright', status: 'Assigned', priority: 'Normal', dueDate: ahead(7), projectId: 'project-customer', createdAt: ago(170), updatedAt: ago(140), progress: 12, isDemoSeed: true },
  { id: 'task-104', title: 'Record infrastructure logging prerequisites', description: 'Identify required audit events and retention decisions for a production deployment.', corporation: 'Development Corporation', department: 'DevOps & Infrastructure', assigneeId: 'platform-engineer', assigneeName: 'Mei Chen', status: 'Blocked', priority: 'High', dueDate: ahead(5), projectId: 'project-controls', createdAt: ago(460), updatedAt: ago(90), progress: 34, isDemoSeed: true },
  { id: 'task-105', title: 'Summarize current approval-chain options', description: 'Compare proposed review steps without changing any permissions.', corporation: 'Holding Headquarters', department: 'AI Workforce Management', assigneeId: 'chief-ai-workforce', assigneeName: 'Jun Park', status: 'Completed', priority: 'Normal', dueDate: ago(2), projectId: 'project-controls', createdAt: ago(620), updatedAt: ago(210), progress: 100, isDemoSeed: true },
  { id: 'task-106', title: 'Prepare campaign measurement plan', description: 'Specify event definitions and source systems required for meaningful campaign reporting.', corporation: 'Marketing Corporation', department: 'Advertising Operations', assigneeId: 'growth-manager', assigneeName: 'Nadia Okafor', status: 'In Progress', priority: 'Normal', dueDate: ahead(9), projectId: 'project-customer', createdAt: ago(320), updatedAt: ago(75), progress: 55, isDemoSeed: true },
  { id: 'task-107', title: 'Review trading research approval boundary', description: 'Confirm analysis requests cannot trigger trades or modify a risk limit.', corporation: 'Trading Corporation', department: 'Risk Management', assigneeId: 'risk-analyst', assigneeName: 'Owen Castillo', status: 'Awaiting Approval', priority: 'Critical', dueDate: ahead(2), projectId: 'project-trading-data', createdAt: ago(270), updatedAt: ago(24), progress: 76, isDemoSeed: true },
  { id: 'task-108', title: 'Document accessible navigation patterns', description: 'Collect keyboard and screen-reader checks for the workspace foundation.', corporation: 'Development Corporation', department: 'Frontend Engineering', assigneeId: 'frontend-engineer', assigneeName: 'Zara Patel', status: 'Backlog', priority: 'Low', dueDate: ahead(12), projectId: 'project-product', createdAt: ago(115), updatedAt: ago(115), progress: 0, isDemoSeed: true },
  { id: 'task-109', title: 'Publish operating review template', description: 'Create a sample template with owner, source, and approval fields.', corporation: 'Holding Headquarters', department: 'Holding Management', assigneeId: 'holding-analyst', assigneeName: 'Mateo Ruiz', status: 'Completed', priority: 'Low', dueDate: ago(1), projectId: 'project-controls', createdAt: ago(520), updatedAt: ago(260), progress: 100, isDemoSeed: true },
  { id: 'task-110', title: 'Define model validation checklist', description: 'List evaluation evidence and escalation gates for any future research model.', corporation: 'Trading Corporation', department: 'Quantitative Research', assigneeId: 'quant-lead', assigneeName: 'Priya Nair', status: 'Backlog', priority: 'High', dueDate: ahead(14), projectId: 'project-trading-data', createdAt: ago(95), updatedAt: ago(95), progress: 0, isDemoSeed: true },
];

const approvals = [
  { id: 'approval-301', title: 'Research data vendor — discovery request', category: 'External Service Subscriptions', requesterId: 'ceo-trading', requesterName: 'Marcus Bennett', corporation: 'Trading Corporation', description: 'Request to evaluate a market-data vendor for a sandbox research workflow. No subscription has been created.', justification: 'A source review is needed before any research output can be treated as current or complete.', amount: 18500, risk: 'High', status: 'Pending', evidence: ['Vendor due-diligence checklist (sample)'], approvalChain: ['Chief Risk Officer', 'Owner'], createdAt: ago(85), isDemoSeed: true },
  { id: 'approval-302', title: 'Trading risk limit change — review only', category: 'Trading Risk Limit Changes', requesterId: 'ceo-trading', requesterName: 'Marcus Bennett', corporation: 'Trading Corporation', description: 'A sample high-risk request to change a trading risk limit. No configuration or trade is connected to this demo.', justification: 'Illustrates the explicit owner authorization path for restricted trading controls.', risk: 'Critical', status: 'Pending', evidence: ['Risk assessment required before a decision'], approvalChain: ['Chief Risk Officer', 'Holding CFO', 'Owner'], createdAt: ago(42), isDemoSeed: true },
  { id: 'approval-303', title: 'Additional QA evaluation role', category: 'Agent Recruitment', requesterId: 'ceo-development', requesterName: 'Linh Tran', corporation: 'Development Corporation', description: 'Request a scoped QA evaluation role with repository read-only access.', justification: 'A bounded evaluation role would help assess regression test coverage before any wider deployment.', risk: 'Medium', status: 'Pending', evidence: ['Proposed role scope: repository read only'], approvalChain: ['Chief AI Workforce Officer', 'Owner'], createdAt: ago(22), isDemoSeed: true },
  { id: 'approval-304', title: 'Security policy review — file scanning', category: 'Security Policy Changes', requesterId: 'cso-security', requesterName: 'Noor Haddad', corporation: 'Holding Headquarters', description: 'Review the control design required before enabling production file uploads.', justification: 'The demo validates file type and size only; an approved malware-scanning service is not configured.', risk: 'Critical', status: 'Pending', evidence: ['Security control checklist (sample)'], approvalChain: ['Chief Security Officer', 'Owner'], createdAt: ago(8), isDemoSeed: true },
];

const decisions = [
  { id: 'decision-401', title: 'Production data residency requirements', description: 'Determine which regions and retention periods are required before production data is stored.', requesterName: 'Noor Haddad', corporation: 'Holding Headquarters', businessImpact: 'Affects vendor selection, customer commitments, and deployment design.', financialImpact: 'Not assessed — no connected finance source.', risk: 'High · data protection', status: 'Under Review', recommendations: ['Collect legal and security requirements', 'Do not migrate private corporate data into the demo environment'], approvalRequired: true, createdAt: ago(190), isDemoSeed: true },
  { id: 'decision-402', title: 'Standardize cross-company operating reviews', description: 'Adopt a shared template that distinguishes verified status, forecast, and owner decisions.', requesterName: 'Idris Okafor', corporation: 'Holding Headquarters', businessImpact: 'Improves review consistency across the three corporation workspaces.', financialImpact: 'No financial impact recorded.', risk: 'Low', status: 'Approved', recommendations: ['Use a common task and dependency register'], approvalRequired: false, createdAt: ago(520), isDemoSeed: true },
  { id: 'decision-403', title: 'Research workspace release criteria', description: 'Define a security, data-quality, and human-approval checklist for a future research workspace.', requesterName: 'Mira Chen', corporation: 'Trading Corporation', businessImpact: 'Would establish operating gates before any production research tool is connected.', financialImpact: 'Not assessed — requires source data and finance review.', risk: 'Medium', status: 'Awaiting Approval', recommendations: ['Require source provenance', 'Keep execution permissions disabled by default'], approvalRequired: true, createdAt: ago(76), isDemoSeed: true },
];

const meetings = [
  { id: 'meeting-501', title: 'Cross-company operating review', type: 'Executive Board Meeting', objective: 'Review demo workspace dependencies and identify owner decisions needed for a production plan.', topics: ['Current integration gaps', 'Data and security prerequisites', 'Decision owners'], participantIds: participantIds.filter((id) => id !== 'owner').slice(0, 8), moderatorId: 'ceo-holding', corporation: 'Holding Headquarters', scheduledAt: ahead(1), status: 'Scheduled', notes: [], isDemoSeed: true },
  { id: 'meeting-502', title: 'Development delivery review', type: 'Project Review', objective: 'Review the sample project plan and clarify which status fields require a live source.', topics: ['Scope', 'Dependencies', 'Release evidence'], participantIds: ['ceo-development', 'eng-manager', 'qa-lead', 'platform-engineer'], moderatorId: 'coo', corporation: 'Development Corporation', scheduledAt: ahead(3), status: 'Scheduled', notes: [], isDemoSeed: true },
];

const notifications = [
  { id: 'notification-601', category: 'Approval Requests', title: 'High-risk approval awaiting review', body: 'A sample trading risk-limit request is waiting for explicit owner authorization.', priority: 'Critical', createdAt: ago(42), linkType: 'approval', linkId: 'approval-302', isDemoSeed: true },
  { id: 'notification-602', category: 'Security Alerts', title: 'Demo security controls are incomplete', body: 'MFA, encryption at rest, and file scanning are not configured in this environment.', priority: 'High', createdAt: ago(26), linkType: 'security', linkId: 'security', isDemoSeed: true },
  { id: 'notification-603', category: 'Meeting Invitations', title: 'Cross-company operating review', body: 'A sample executive session is scheduled for the next day.', priority: 'Normal', createdAt: ago(18), linkType: 'meeting', linkId: 'meeting-501', isDemoSeed: true },
  { id: 'notification-604', category: 'Task Assignments', title: 'Review access boundaries', body: 'A sample development task is under review.', priority: 'Normal', createdAt: ago(12), linkType: 'task', linkId: 'task-102', isDemoSeed: true },
];

const documents = [
  { id: 'doc-701', title: 'Demo workspace operating note', corporation: 'Holding Headquarters', department: 'Holding Management', visibility: 'Holding only', body: 'This workspace contains seeded sample records for workflow exploration. No live agent provider, financial system, market feed, ad platform, or production identity provider is connected. Validate all records before using them in a real operating decision.', updatedAt: ago(60), createdBy: 'owner', isDemoSeed: true },
  { id: 'doc-702', title: 'Research source validation checklist', corporation: 'Trading Corporation', department: 'Market Research', visibility: 'Corporation', body: 'Before relying on a research source, record its owner, licensing scope, update cadence, validation method, and the person responsible for review. Sample checklist only; it does not certify a source.', updatedAt: ago(110), createdBy: 'ceo-trading', isDemoSeed: true },
  { id: 'doc-703', title: 'Production security prerequisites', corporation: 'Development Corporation', department: 'Cybersecurity', visibility: 'Corporation', body: 'Production deployment requires an approved identity provider, MFA, durable database, encrypted backups, malware scanning for uploads, centralized monitoring, and a reviewed incident process. None of these controls are asserted to be active in this demo.', updatedAt: ago(22), createdBy: 'cso-security', isDemoSeed: true },
];

const initial = {
  mode: 'demo', initializedAt: new Date(now).toISOString(), owner, agents, conversations, messages, tasks, projects,
  approvals, decisions, meetings, commands: [], notifications, auditLogs: [], savedMessageIds: [], attachments: [], documents,
  notificationPreferences: { inApp: true, email: false, securityAlerts: true, mentions: true, taskUpdates: true },
};

module.exports = { initial, owner, agents };
