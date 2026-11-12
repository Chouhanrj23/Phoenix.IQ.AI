// Phoenix reverse-engineering knowledge graph. Load with cypher-shell or paste into Neo4j Browser.
// Nodes are keyed on (id, systemId), matching graph-persistence's tenancy model.
MERGE (n:System {id: 'indian-banking-system', systemId: 'indian-banking-system'}) SET n.label = 'Bank of Anthos', n.description = 'A cloud-native microservices-based online banking platform that allows customers to open accounts, check balances, make payments, and manage contacts.';
MERGE (n:Module {id: 'module-1', systemId: 'indian-banking-system'}) SET n.label = 'Overview', n.coverage = 'full', n.summary = 'Cross-cutting platform: identity, login/sign-up, sessions, security, observability, shared services';
MERGE (n:Module {id: 'module-2', systemId: 'indian-banking-system'}) SET n.label = 'Accounts', n.coverage = 'partial', n.summary = 'Customer and bank-account lifecycle, profile, balances, contacts/payees - but lacks full account management features';
MERGE (n:Module {id: 'module-3', systemId: 'indian-banking-system'}) SET n.label = 'Payments and Transfer', n.coverage = 'partial', n.summary = 'Sending money between accounts, external transfers, validation, transaction history - but lacks advanced payment features';
MERGE (n:Module {id: 'module-4', systemId: 'indian-banking-system'}) SET n.label = 'Deposits', n.coverage = 'partial', n.summary = 'Money coming in: deposits from external accounts, crediting balances - but lacks comprehensive deposit processing';
MERGE (n:Module {id: 'module-5', systemId: 'indian-banking-system'}) SET n.label = 'Cards', n.coverage = 'none', n.summary = 'No card management functionality implemented';
MERGE (n:Module {id: 'module-6', systemId: 'indian-banking-system'}) SET n.label = 'Loans', n.coverage = 'none', n.summary = 'No loan origination, servicing, or credit decisioning capabilities';
MERGE (n:Domain {id: 'dom-identity', systemId: 'indian-banking-system'}) SET n.label = 'Identity Management', n.confidence = 'high', n.description = 'User authentication, account creation, and session management';
MERGE (n:Aggregate {id: 'agg-user', systemId: 'indian-banking-system'}) SET n.label = 'User', n.confidence = 'high';
MERGE (n:Domain {id: 'dom-accounts', systemId: 'indian-banking-system'}) SET n.label = 'Account Management', n.confidence = 'high', n.description = 'Customer account information, balances, and contacts';
MERGE (n:Aggregate {id: 'agg-account', systemId: 'indian-banking-system'}) SET n.label = 'Account', n.confidence = 'high';
MERGE (n:Aggregate {id: 'agg-contact', systemId: 'indian-banking-system'}) SET n.label = 'Contact', n.confidence = 'high';
MERGE (n:Domain {id: 'dom-payments', systemId: 'indian-banking-system'}) SET n.label = 'Payments', n.confidence = 'high', n.description = 'Transaction processing and payment management';
MERGE (n:Aggregate {id: 'agg-transaction', systemId: 'indian-banking-system'}) SET n.label = 'Transaction', n.confidence = 'high';
MERGE (n:Domain {id: 'dom-deposits', systemId: 'indian-banking-system'}) SET n.label = 'Deposits', n.confidence = 'high', n.description = 'External deposit processing and balance crediting';
MERGE (n:Aggregate {id: 'agg-deposit', systemId: 'indian-banking-system'}) SET n.label = 'Deposit', n.confidence = 'high';
MERGE (n:Entity {id: 'ent-user', systemId: 'indian-banking-system'}) SET n.label = 'User', n.confidence = 'high', n.storage = 'PostgreSQL accounts-db.users', n.attributes = 'accountid, username, passhash, firstname, lastname, birthday, timezone, address, state, zip, ssn';
MERGE (n:Entity {id: 'ent-account', systemId: 'indian-banking-system'}) SET n.label = 'Account', n.confidence = 'high', n.storage = 'PostgreSQL accounts-db.users', n.attributes = 'accountid';
MERGE (n:Entity {id: 'ent-balance', systemId: 'indian-banking-system'}) SET n.label = 'Balance', n.confidence = 'high', n.storage = 'PostgreSQL ledger-db.balances', n.attributes = 'accountNum, balance, lastUpdated';
MERGE (n:Entity {id: 'ent-contact', systemId: 'indian-banking-system'}) SET n.label = 'Contact', n.confidence = 'high', n.storage = 'PostgreSQL accounts-db.contacts', n.attributes = 'username, label, account_num, routing_num, is_external';
MERGE (n:Entity {id: 'ent-transaction', systemId: 'indian-banking-system'}) SET n.label = 'Transaction', n.confidence = 'high', n.storage = 'PostgreSQL ledger-db.transactions', n.attributes = 'id, fromAccountNum, fromRoutingNum, toAccountNum, toRoutingNum, amount, timestamp, uuid';
MERGE (n:Entity {id: 'ent-deposit', systemId: 'indian-banking-system'}) SET n.label = 'Deposit', n.confidence = 'high', n.storage = 'PostgreSQL ledger-db.transactions', n.attributes = 'id, fromAccountNum, fromRoutingNum, toAccountNum, toRoutingNum, amount, timestamp, uuid';
MERGE (n:Activity {id: 'act-user-login', systemId: 'indian-banking-system'}) SET n.label = 'User login', n.module = 'module-1', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'POST /login';
MERGE (n:Activity {id: 'act-user-signup', systemId: 'indian-banking-system'}) SET n.label = 'User signup', n.module = 'module-1', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'POST /signup';
MERGE (n:Activity {id: 'act-view-balance', systemId: 'indian-banking-system'}) SET n.label = 'View account balance', n.module = 'module-2', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'GET /balances/{account_id}';
MERGE (n:Activity {id: 'act-add-contact', systemId: 'indian-banking-system'}) SET n.label = 'Add contact', n.module = 'module-2', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'POST /contacts/{username}';
MERGE (n:Activity {id: 'act-make-payment', systemId: 'indian-banking-system'}) SET n.label = 'Make payment', n.module = 'module-3', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'POST /payment';
MERGE (n:Activity {id: 'act-view-transaction-history', systemId: 'indian-banking-system'}) SET n.label = 'View transaction history', n.module = 'module-3', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'GET /transactions/{account_id}';
MERGE (n:Activity {id: 'act-make-deposit', systemId: 'indian-banking-system'}) SET n.label = 'Make deposit', n.module = 'module-4', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'POST /deposit';
MERGE (n:Activity {id: 'act-validate-transaction', systemId: 'indian-banking-system'}) SET n.label = 'Validate transaction', n.module = 'module-3', n.confidence = 'high', n.actor = 'system';
MERGE (n:Activity {id: 'act-process-transaction', systemId: 'indian-banking-system'}) SET n.label = 'Process transaction', n.module = 'module-3', n.confidence = 'high', n.actor = 'system';
MERGE (n:Activity {id: 'act-refresh-balance-cache', systemId: 'indian-banking-system'}) SET n.label = 'Refresh balance cache', n.module = 'module-2', n.confidence = 'high', n.actor = 'system';
MERGE (n:Activity {id: 'act-authenticate-oauth', systemId: 'indian-banking-system'}) SET n.label = 'Authenticate OAuth', n.module = 'module-1', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'POST /consent';
MERGE (n:Activity {id: 'act-logout', systemId: 'indian-banking-system'}) SET n.label = 'User logout', n.module = 'module-1', n.confidence = 'high', n.actor = 'customer', n.endpoint = 'POST /logout';
MERGE (n:Flow {id: 'flow-user-login', systemId: 'indian-banking-system'}) SET n.label = 'User Login Flow', n.module = 'module-1', n.confidence = 'high', n.actor = 'customer';
MERGE (n:Flow {id: 'flow-user-signup', systemId: 'indian-banking-system'}) SET n.label = 'User Signup Flow', n.module = 'module-1', n.confidence = 'high', n.actor = 'customer';
MERGE (n:Flow {id: 'flow-make-payment', systemId: 'indian-banking-system'}) SET n.label = 'Make Payment Flow', n.module = 'module-3', n.confidence = 'high', n.actor = 'customer';
MERGE (n:Flow {id: 'flow-view-balance', systemId: 'indian-banking-system'}) SET n.label = 'View Balance Flow', n.module = 'module-2', n.confidence = 'high', n.actor = 'customer';
MERGE (n:Flow {id: 'flow-make-deposit', systemId: 'indian-banking-system'}) SET n.label = 'Make Deposit Flow', n.module = 'module-4', n.confidence = 'high', n.actor = 'customer';
MERGE (n:Persona {id: 'per-customer', systemId: 'indian-banking-system'}) SET n.label = 'John Customer', n.confidence = 'high', n.role = 'Bank Customer';
MERGE (n:Persona {id: 'per-operator', systemId: 'indian-banking-system'}) SET n.label = 'Bank Operator', n.confidence = 'high', n.role = 'Bank Operations Staff';
MERGE (n:Persona {id: 'per-engineer', systemId: 'indian-banking-system'}) SET n.label = 'Dev Engineer', n.confidence = 'high', n.role = 'System Developer';
MERGE (n:Journey {id: 'jrn-customer-login', systemId: 'indian-banking-system'}) SET n.label = 'Customer Login Journey', n.module = 'module-1', n.confidence = 'high';
MERGE (n:Journey {id: 'jrn-customer-payment', systemId: 'indian-banking-system'}) SET n.label = 'Customer Payment Journey', n.module = 'module-3', n.confidence = 'high';
MERGE (n:Journey {id: 'jrn-operator-monitoring', systemId: 'indian-banking-system'}) SET n.label = 'Operator Monitoring Journey', n.module = 'module-1', n.confidence = 'high';
MERGE (n:Journey {id: 'jrn-engineer-maintenance', systemId: 'indian-banking-system'}) SET n.label = 'Engineer Maintenance Journey', n.module = 'module-1', n.confidence = 'high';
MERGE (n:Report {id: 'rep-account-balance', systemId: 'indian-banking-system'}) SET n.label = 'Account Balance Report', n.module = 'module-2', n.confidence = 'high', n.implemented = 'true';
MERGE (n:Report {id: 'rep-transaction-history', systemId: 'indian-banking-system'}) SET n.label = 'Transaction History Report', n.module = 'module-3', n.confidence = 'high', n.implemented = 'true';
MERGE (n:Report {id: 'rep-monthly-statement', systemId: 'indian-banking-system'}) SET n.label = 'Monthly Statement', n.module = 'module-2', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-account-summary', systemId: 'indian-banking-system'}) SET n.label = 'Account Summary Dashboard', n.module = 'module-2', n.confidence = 'high', n.implemented = 'true';
MERGE (n:Report {id: 'rep-payment-failures', systemId: 'indian-banking-system'}) SET n.label = 'Payment Failures Report', n.module = 'module-3', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-deposit-summary', systemId: 'indian-banking-system'}) SET n.label = 'Deposit Summary Report', n.module = 'module-4', n.confidence = 'high', n.implemented = 'true';
MERGE (n:Report {id: 'rep-contact-list', systemId: 'indian-banking-system'}) SET n.label = 'Contact List Report', n.module = 'module-2', n.confidence = 'high', n.implemented = 'true';
MERGE (n:Report {id: 'rep-fraud-detection', systemId: 'indian-banking-system'}) SET n.label = 'Fraud Detection Report', n.module = 'module-3', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-regulatory-compliance', systemId: 'indian-banking-system'}) SET n.label = 'Regulatory Compliance Report', n.module = 'module-1', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-system-health', systemId: 'indian-banking-system'}) SET n.label = 'System Health Dashboard', n.module = 'module-1', n.confidence = 'high', n.implemented = 'true';
MERGE (n:Report {id: 'rep-user-activity', systemId: 'indian-banking-system'}) SET n.label = 'User Activity Report', n.module = 'module-1', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-card-activity', systemId: 'indian-banking-system'}) SET n.label = 'Card Activity Report', n.module = 'module-5', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-loan-status', systemId: 'indian-banking-system'}) SET n.label = 'Loan Status Report', n.module = 'module-6', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-reconciliation', systemId: 'indian-banking-system'}) SET n.label = 'Account Reconciliation Report', n.module = 'module-2', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Report {id: 'rep-audit-log', systemId: 'indian-banking-system'}) SET n.label = 'Audit Log', n.module = 'module-1', n.confidence = 'inferred', n.implemented = 'false';
MERGE (n:Capability {id: 'cap-user-authentication', systemId: 'indian-banking-system'}) SET n.label = 'User Authentication', n.module = 'module-1', n.confidence = 'high', n.status = 'implemented';
MERGE (n:Capability {id: 'cap-account-management', systemId: 'indian-banking-system'}) SET n.label = 'Account Management', n.module = 'module-2', n.confidence = 'high', n.status = 'implemented';
MERGE (n:Capability {id: 'cap-payment-processing', systemId: 'indian-banking-system'}) SET n.label = 'Payment Processing', n.module = 'module-3', n.confidence = 'high', n.status = 'implemented';
MERGE (n:Capability {id: 'cap-deposit-processing', systemId: 'indian-banking-system'}) SET n.label = 'Deposit Processing', n.module = 'module-4', n.confidence = 'high', n.status = 'implemented';
MERGE (n:Capability {id: 'cap-balance-management', systemId: 'indian-banking-system'}) SET n.label = 'Balance Management', n.module = 'module-2', n.confidence = 'high', n.status = 'implemented';
MERGE (n:Capability {id: 'cap-transaction-history', systemId: 'indian-banking-system'}) SET n.label = 'Transaction History', n.module = 'module-3', n.confidence = 'high', n.status = 'implemented';
MERGE (n:Capability {id: 'cap-contact-management', systemId: 'indian-banking-system'}) SET n.label = 'Contact Management', n.module = 'module-2', n.confidence = 'high', n.status = 'implemented';
MERGE (n:Capability {id: 'cap-card-management', systemId: 'indian-banking-system'}) SET n.label = 'Card Management', n.module = 'module-5', n.confidence = 'inferred', n.status = 'gap';
MERGE (n:Capability {id: 'cap-loan-processing', systemId: 'indian-banking-system'}) SET n.label = 'Loan Processing', n.module = 'module-6', n.confidence = 'inferred', n.status = 'gap';
MERGE (n:Capability {id: 'cap-fraud-detection', systemId: 'indian-banking-system'}) SET n.label = 'Fraud Detection', n.module = 'module-3', n.confidence = 'inferred', n.status = 'gap';
MERGE (n:Capability {id: 'cap-regulatory-compliance', systemId: 'indian-banking-system'}) SET n.label = 'Regulatory Compliance', n.module = 'module-1', n.confidence = 'inferred', n.status = 'gap';
MERGE (n:Capability {id: 'cap-audit-logging', systemId: 'indian-banking-system'}) SET n.label = 'Audit Logging', n.module = 'module-1', n.confidence = 'inferred', n.status = 'gap';
MERGE (n:Epic {id: 'epic-identity-management', systemId: 'indian-banking-system'}) SET n.label = 'Identity Management Enhancement', n.module = 'module-1', n.confidence = 'high';
MERGE (n:Feature {id: 'feat-multi-factor-auth', systemId: 'indian-banking-system'}) SET n.label = 'Multi-Factor Authentication', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-001', systemId: 'indian-banking-system'}) SET n.label = 'Enroll in Multi-Factor Authentication', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to enroll in multi-factor authentication for my account, so that I can add an extra layer of security to my login process.';
MERGE (n:Story {id: 'story-002', systemId: 'indian-banking-system'}) SET n.label = 'Login with Multi-Factor Authentication', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to log in using multi-factor authentication, so that I can securely access my account with enhanced security.';
MERGE (n:Story {id: 'story-003', systemId: 'indian-banking-system'}) SET n.label = 'Recover Multi-Factor Authentication', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to recover access to my account if I lose my authentication device, so that I can still access my account in case of lost or broken devices.';
MERGE (n:Feature {id: 'feat-session-management', systemId: 'indian-banking-system'}) SET n.label = 'Enhanced Session Management', n.confidence = 'high';
MERGE (n:Story {id: 'story-004', systemId: 'indian-banking-system'}) SET n.label = 'Remember Device Option', n.confidence = 'inferred', n.priority = 'could', n.story = 'As a a bank customer, I want to remember my login device, so that I don\'t need to authenticate as frequently on trusted devices.';
MERGE (n:Story {id: 'story-005', systemId: 'indian-banking-system'}) SET n.label = 'Session Activity Monitoring', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to view my recent account activity, so that I can monitor account access and detect unauthorized activity.';
MERGE (n:Feature {id: 'feat-audit-logging', systemId: 'indian-banking-system'}) SET n.label = 'Comprehensive Audit Logging', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-006', systemId: 'indian-banking-system'}) SET n.label = 'View Account Activity Log', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to view a detailed log of my account activities, so that I can monitor all actions performed on my account.';
MERGE (n:Story {id: 'story-007', systemId: 'indian-banking-system'}) SET n.label = 'Administrative Audit Access', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank operator, I want to access detailed audit logs for customer accounts, so that I can investigate issues and ensure compliance.';
MERGE (n:Epic {id: 'epic-account-management', systemId: 'indian-banking-system'}) SET n.label = 'Account Management Enhancement', n.module = 'module-2', n.confidence = 'high';
MERGE (n:Feature {id: 'feat-account-summary', systemId: 'indian-banking-system'}) SET n.label = 'Enhanced Account Summary', n.confidence = 'high';
MERGE (n:Story {id: 'story-008', systemId: 'indian-banking-system'}) SET n.label = 'View Account Overview', n.confidence = 'high', n.priority = 'must', n.story = 'As a a bank customer, I want to see a comprehensive overview of all my accounts, so that I can quickly understand my financial situation across all accounts.';
MERGE (n:Story {id: 'story-009', systemId: 'indian-banking-system'}) SET n.label = 'View Detailed Account Information', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to view detailed information about a specific account, so that I can see account details, terms, and conditions.';
MERGE (n:Feature {id: 'feat-monthly-statements', systemId: 'indian-banking-system'}) SET n.label = 'Monthly Statement Generation', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-010', systemId: 'indian-banking-system'}) SET n.label = 'Generate Monthly Statement', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to receive a monthly statement of my account activity, so that I can track my financial activities and reconcile my records.';
MERGE (n:Story {id: 'story-011', systemId: 'indian-banking-system'}) SET n.label = 'Statement Delivery Options', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to choose how I receive my monthly statements, so that I can receive statements in my preferred format.';
MERGE (n:Feature {id: 'feat-contact-management', systemId: 'indian-banking-system'}) SET n.label = 'Enhanced Contact Management', n.confidence = 'high';
MERGE (n:Story {id: 'story-012', systemId: 'indian-banking-system'}) SET n.label = 'Organize Contacts into Groups', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to organize my contacts into groups, so that I can manage my contacts more efficiently.';
MERGE (n:Story {id: 'story-013', systemId: 'indian-banking-system'}) SET n.label = 'Create Payment Templates', n.confidence = 'inferred', n.priority = 'could', n.story = 'As a a bank customer, I want to create payment templates for frequent transfers, so that I can make recurring payments more quickly.';
MERGE (n:Epic {id: 'epic-payment-processing', systemId: 'indian-banking-system'}) SET n.label = 'Payment Processing Enhancement', n.module = 'module-3', n.confidence = 'high';
MERGE (n:Feature {id: 'feat-scheduled-payments', systemId: 'indian-banking-system'}) SET n.label = 'Scheduled and Recurring Payments', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-014', systemId: 'indian-banking-system'}) SET n.label = 'Schedule a Future Payment', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to schedule a payment for a future date, so that I can plan my payments in advance.';
MERGE (n:Story {id: 'story-015', systemId: 'indian-banking-system'}) SET n.label = 'Create a Recurring Payment', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to create a recurring payment, so that I can make regular payments automatically.';
MERGE (n:Feature {id: 'feat-fraud-detection', systemId: 'indian-banking-system'}) SET n.label = 'Fraud Detection System', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-016', systemId: 'indian-banking-system'}) SET n.label = 'Monitor for Suspicious Activity', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank fraud analyst, I want to monitor transactions for suspicious patterns, so that I can detect and prevent fraudulent activity.';
MERGE (n:Story {id: 'story-017', systemId: 'indian-banking-system'}) SET n.label = 'Customer Fraud Alerts', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to receive alerts about suspicious activity on my account, so that I can quickly respond to potential fraud.';
MERGE (n:Feature {id: 'feat-payment-validation', systemId: 'indian-banking-system'}) SET n.label = 'Enhanced Payment Validation', n.confidence = 'high';
MERGE (n:Story {id: 'story-018', systemId: 'indian-banking-system'}) SET n.label = 'Configure Payment Validation Rules', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank operator, I want to configure validation rules for payments, so that I can enforce business rules and prevent errors.';
MERGE (n:Story {id: 'story-019', systemId: 'indian-banking-system'}) SET n.label = 'Real-Time Payment Validation', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to receive immediate feedback on payment validation, so that I can correct errors before submitting.';
MERGE (n:Epic {id: 'epic-deposit-processing', systemId: 'indian-banking-system'}) SET n.label = 'Deposit Processing Enhancement', n.module = 'module-4', n.confidence = 'high';
MERGE (n:Feature {id: 'feat-deposit-tracking', systemId: 'indian-banking-system'}) SET n.label = 'Enhanced Deposit Tracking', n.confidence = 'high';
MERGE (n:Story {id: 'story-020', systemId: 'indian-banking-system'}) SET n.label = 'View Deposit Status', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to see the status of my deposits, so that I can know when my funds will be available.';
MERGE (n:Story {id: 'story-021', systemId: 'indian-banking-system'}) SET n.label = 'View Deposit History', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to view my deposit history, so that I can track all my deposits over time.';
MERGE (n:Feature {id: 'feat-deposit-verification', systemId: 'indian-banking-system'}) SET n.label = 'Deposit Verification System', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-022', systemId: 'indian-banking-system'}) SET n.label = 'Verify External Deposits', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank operator, I want to verify large or unusual deposits, so that I can ensure compliance and prevent fraud.';
MERGE (n:Story {id: 'story-023', systemId: 'indian-banking-system'}) SET n.label = 'Configure Deposit Automation Rules', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank operator, I want to configure rules for automatic deposit verification, so that I can streamline the verification process.';
MERGE (n:Feature {id: 'feat-deposit-reporting', systemId: 'indian-banking-system'}) SET n.label = 'Deposit Reporting and Analytics', n.confidence = 'high';
MERGE (n:Story {id: 'story-024', systemId: 'indian-banking-system'}) SET n.label = 'View Deposit Summary Report', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to see a summary of my deposits, so that I can track my deposit activity.';
MERGE (n:Story {id: 'story-025', systemId: 'indian-banking-system'}) SET n.label = 'Deposit Analytics Dashboard', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank operator, I want to access deposit analytics, so that I can identify trends and issues.';
MERGE (n:Epic {id: 'epic-card-management', systemId: 'indian-banking-system'}) SET n.label = 'Card Management System', n.module = 'module-5', n.confidence = 'inferred';
MERGE (n:Feature {id: 'feat-card-issuance', systemId: 'indian-banking-system'}) SET n.label = 'Card Issuance', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-026', systemId: 'indian-banking-system'}) SET n.label = 'Apply for a New Card', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to apply for a new credit or debit card, so that I can have access to additional payment methods.';
MERGE (n:Story {id: 'story-027', systemId: 'indian-banking-system'}) SET n.label = 'Select Card Type', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to choose from different card types, so that I can select the card that best fits my needs.';
MERGE (n:Feature {id: 'feat-card-management', systemId: 'indian-banking-system'}) SET n.label = 'Card Management Features', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-028', systemId: 'indian-banking-system'}) SET n.label = 'Activate a New Card', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to activate my new card, so that I can start using it.';
MERGE (n:Story {id: 'story-029', systemId: 'indian-banking-system'}) SET n.label = 'Manage Card Controls', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to set controls and limits on my cards, so that I can manage my card usage and security.';
MERGE (n:Feature {id: 'feat-card-activity', systemId: 'indian-banking-system'}) SET n.label = 'Card Activity Monitoring', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-030', systemId: 'indian-banking-system'}) SET n.label = 'View Card Transactions', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to view my card transaction history, so that I can track my spending.';
MERGE (n:Story {id: 'story-031', systemId: 'indian-banking-system'}) SET n.label = 'Set Card Transaction Alerts', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to receive alerts for card transactions, so that I can monitor my card activity.';
MERGE (n:Epic {id: 'epic-loan-processing', systemId: 'indian-banking-system'}) SET n.label = 'Loan Processing System', n.module = 'module-6', n.confidence = 'inferred';
MERGE (n:Feature {id: 'feat-loan-origination', systemId: 'indian-banking-system'}) SET n.label = 'Loan Origination', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-032', systemId: 'indian-banking-system'}) SET n.label = 'Apply for a Loan', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to apply for a loan, so that I can access funds for major purchases.';
MERGE (n:Story {id: 'story-033', systemId: 'indian-banking-system'}) SET n.label = 'Prequalify for a Loan', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank customer, I want to prequalify for a loan, so that I can understand my borrowing options.';
MERGE (n:Feature {id: 'feat-loan-servicing', systemId: 'indian-banking-system'}) SET n.label = 'Loan Servicing', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-034', systemId: 'indian-banking-system'}) SET n.label = 'View Loan Dashboard', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to see an overview of my loans, so that I can manage my loan accounts.';
MERGE (n:Story {id: 'story-035', systemId: 'indian-banking-system'}) SET n.label = 'Make Loan Payments', n.confidence = 'inferred', n.priority = 'must', n.story = 'As a a bank customer, I want to make payments on my loans, so that I can stay current on my obligations.';
MERGE (n:Feature {id: 'feat-loan-analytics', systemId: 'indian-banking-system'}) SET n.label = 'Loan Analytics and Reporting', n.confidence = 'inferred';
MERGE (n:Story {id: 'story-036', systemId: 'indian-banking-system'}) SET n.label = 'Generate Loan Reports', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank loan officer, I want to generate reports on loan performance, so that I can assess portfolio health.';
MERGE (n:Story {id: 'story-037', systemId: 'indian-banking-system'}) SET n.label = 'Loan Analytics Dashboard', n.confidence = 'inferred', n.priority = 'should', n.story = 'As a a bank analyst, I want to access loan analytics, so that I can identify trends and opportunities.';
MERGE (n:Container {id: 'svc-frontend', systemId: 'indian-banking-system'}) SET n.label = 'Frontend Service', n.confidence = 'high', n.technology = 'Python Flask';
MERGE (n:Container {id: 'svc-userservice', systemId: 'indian-banking-system'}) SET n.label = 'User Service', n.confidence = 'high', n.technology = 'Python Flask';
MERGE (n:Container {id: 'svc-balancereader', systemId: 'indian-banking-system'}) SET n.label = 'Balance Reader', n.confidence = 'high', n.technology = 'Java Spring Boot';
MERGE (n:Container {id: 'svc-contacts', systemId: 'indian-banking-system'}) SET n.label = 'Contacts Service', n.confidence = 'high', n.technology = 'Python Flask';
MERGE (n:Container {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}) SET n.label = 'Ledger Writer', n.confidence = 'high', n.technology = 'Java Spring Boot';
MERGE (n:Container {id: 'svc-transactionhistory', systemId: 'indian-banking-system'}) SET n.label = 'Transaction History', n.confidence = 'high', n.technology = 'Java Spring Boot';
MERGE (n:Container {id: 'ds-accounts-db', systemId: 'indian-banking-system'}) SET n.label = 'Accounts Database', n.confidence = 'high', n.technology = 'PostgreSQL';
MERGE (n:Container {id: 'ds-ledger-db', systemId: 'indian-banking-system'}) SET n.label = 'Ledger Database', n.confidence = 'high', n.technology = 'PostgreSQL';
MERGE (n:Integration {id: 'int-gcp-metadata', systemId: 'indian-banking-system'}) SET n.label = 'Google Cloud Metadata Server', n.confidence = 'high', n.protocol = 'HTTP', n.counterpart = 'Google Cloud Platform';
MERGE (n:Integration {id: 'int-gcp-trace', systemId: 'indian-banking-system'}) SET n.label = 'Google Cloud Trace', n.confidence = 'high', n.protocol = 'HTTP', n.counterpart = 'Google Cloud Platform';
MERGE (n:Integration {id: 'int-gcp-monitoring', systemId: 'indian-banking-system'}) SET n.label = 'Google Cloud Monitoring', n.confidence = 'high', n.protocol = 'HTTP', n.counterpart = 'Google Cloud Platform';
MERGE (n:Integration {id: 'int-gcp-logging', systemId: 'indian-banking-system'}) SET n.label = 'Google Cloud Logging', n.confidence = 'high', n.protocol = 'HTTP', n.counterpart = 'Google Cloud Platform';
MERGE (n:Integration {id: 'int-oauth', systemId: 'indian-banking-system'}) SET n.label = 'OAuth Provider', n.confidence = 'high', n.protocol = 'HTTP', n.counterpart = 'OAuth Provider';
MERGE (n:Integration {id: 'int-external-banks', systemId: 'indian-banking-system'}) SET n.label = 'External Bank Accounts', n.confidence = 'high', n.protocol = 'HTTP', n.counterpart = 'External Banks';
MERGE (n:ExpertInput {id: 'expert-module-1-introductory-1', systemId: 'indian-banking-system'}) SET n.label = 'Is this an accurate and complete description of what Overview does in your or...', n.module = 'module-1', n.confidence = 'high', n.question = 'Is this an accurate and complete description of what Overview does in your organisation? What is missing or wrong?', n.answer = 'Mostly accurate. Overview is the shared platform layer: sign-up, login, sessions, security and monitoring used by every other module. Two things are missing. Customer notifications (email/SMS alerts for logins and payments) are also a shared service. Multi-factor authentication should be listed under security, because the bank needs it for regulatory reasons even though it isn’t built yet.', n.statement = 'Mostly accurate. Overview is the shared platform layer: sign-up, login, sessions, security and monitoring used by every other module. Two things are missing. Customer notifications (email/SMS alerts for logins and payments) are also a shared service. Multi-factor authentication should be listed under security, because the bank needs it for regulatory reasons even though it isn’t built yet.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:47:59.387Z';
MERGE (n:ExpertInput {id: 'expert-module-1-introductory-2', systemId: 'indian-banking-system'}) SET n.label = 'How does a bank customer use Overview day to day, and what matters most to them?', n.module = 'module-1', n.confidence = 'high', n.question = 'How does a bank customer use Overview day to day, and what matters most to them?', n.answer = 'Customers touch Overview every time they log in, usually once or twice a day to check their balance or make a payment. What matters most is a fast, reliable login and staying signed in long enough to finish a task. The 15-minute timeout is a common complaint when people are filling in payment details. They also expect to be told quickly if someone else logs into their account.', n.statement = 'Customers touch Overview every time they log in, usually once or twice a day to check their balance or make a payment. What matters most is a fast, reliable login and staying signed in long enough to finish a task. The 15-minute timeout is a common complaint when people are filling in payment details. They also expect to be told quickly if someone else logs into their account.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:47:59.387Z';
MERGE (n:ExpertInput {id: 'expert-module-1-introductory-3', systemId: 'indian-banking-system'}) SET n.label = 'Who relies on "User Authentication", and which business outcome does it support?', n.module = 'module-1', n.confidence = 'high', n.question = 'Who relies on "User Authentication", and which business outcome does it support?', n.answer = 'Every customer, plus the payments, accounts and deposits modules, which all trust its session token. Customer support also relies on it when helping locked-out users. The outcome is secure access to accounts. That protects against fraud and account takeover, and it’s a basic regulatory requirement for online banking.', n.statement = 'Every customer, plus the payments, accounts and deposits modules, which all trust its session token. Customer support also relies on it when helping locked-out users. The outcome is secure access to accounts. That protects against fraud and account takeover, and it’s a basic regulatory requirement for online banking.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:47:59.387Z';
MERGE (n:ExpertInput {id: 'expert-module-1-introductory-4', systemId: 'indian-banking-system'}) SET n.label = 'What does a User record represent in the business, and who is responsible for...', n.module = 'module-1', n.confidence = 'high', n.question = 'What does a User record represent in the business, and who is responsible for keeping it correct?', n.answer = 'A User record is one customer’s online banking identity: login name, password hash, name, address, date of birth and SSN. It links to the customer’s bank accounts. Customers keep their own contact details up to date, while onboarding/KYC operations own the identity data (name, date of birth, SSN) and must approve changes to it. The security team owns credential and password policies.

Saving these adds them as real records in expert-answers.jsonl. If you’re only testing, delete that file afterwards so dummy answers don’t end up in the training data.', n.statement = 'A User record is one customer’s online banking identity: login name, password hash, name, address, date of birth and SSN. It links to the customer’s bank accounts. Customers keep their own contact details up to date, while onboarding/KYC operations own the identity data (name, date of birth, SSN) and must approve changes to it. The security team owns credential and password policies.

Saving these adds them as real records in expert-answers.jsonl. If you’re only testing, delete that file afterwards so dummy answers don’t end up in the training data.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:47:59.387Z';
MERGE (n:ExpertInput {id: 'expert-module-1-intermediate-1', systemId: 'indian-banking-system'}) SET n.label = 'Is this rule correct as written? What exceptions, limits or approvals apply i...', n.module = 'module-1', n.confidence = 'high', n.question = 'Is this rule correct as written? What exceptions, limits or approvals apply in practice?', n.answer = 'Broadly correct. 15 minutes of inactivity is the standard timeout for web banking. Exceptions:

The mobile app can stay signed in up to 30 minutes, because it re-checks identity with fingerprint or face ID.
Show a warning 2 minutes before logout, with an option to stay signed in.
Never time out halfway through a payment without saving the draft.
Even with activity, sessions should end after 8 hours.', n.statement = 'Broadly correct. 15 minutes of inactivity is the standard timeout for web banking. Exceptions:

The mobile app can stay signed in up to 30 minutes, because it re-checks identity with fingerprint or face ID.
Show a warning 2 minutes before logout, with an option to stay signed in.
Never time out halfway through a payment without saving the draft.
Even with activity, sessions should end after 8 hours.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:48:41.116Z';
MERGE (n:ExpertInput {id: 'expert-module-1-intermediate-2', systemId: 'indian-banking-system'}) SET n.label = 'When "User login" runs, what should happen if the input is invalid or a step ...', n.module = 'module-1', n.confidence = 'high', n.question = 'When "User login" runs, what should happen if the input is invalid or a step fails?', n.answer = 'Wrong username or password: show one generic message (“Username or password is incorrect”) so attackers can’t tell which accounts exist.
Lockout: lock the account for 30 minutes after 5 failed attempts in a row, email the customer, and record it in the security log.
Locked or closed accounts: a customer whose account is locked or closed sees a message to contact support.
Service down: if the login service is unavailable, show a friendly retry message and don’t count it as a failed attempt.
Unusual login: if the login comes from a new device or country, ask for a one-time code before creating the session.', n.statement = 'Wrong username or password: show one generic message (“Username or password is incorrect”) so attackers can’t tell which accounts exist.
Lockout: lock the account for 30 minutes after 5 failed attempts in a row, email the customer, and record it in the security log.
Locked or closed accounts: a customer whose account is locked or closed sees a message to contact support.
Service down: if the login service is unavailable, show a friendly retry message and don’t count it as a failed attempt.
Unusual login: if the login comes from a new device or country, ask for a one-time code before creating the session.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:48:41.116Z';
MERGE (n:ExpertInput {id: 'expert-module-1-intermediate-3', systemId: 'indian-banking-system'}) SET n.label = 'How should "Regulatory Compliance" work step by step: who starts it, what is ...', n.module = 'module-1', n.confidence = 'high', n.question = 'How should "Regulatory Compliance" work step by step: who starts it, what is checked, and what is the outcome?', n.answer = 'Onboarding: when a customer signs up, the system runs identity checks (KYC): name, date of birth, SSN and address are checked against a verification provider.
Screening: sanctions and watch-list screening runs at sign-up and again every night for existing customers.
Payment monitoring: every payment is checked against monitoring rules (large amounts, unusual frequency, new payees). Payments that match a rule are held for the compliance team.
Outcome: the compliance team approves or rejects the held payments and files suspicious activity reports where needed.
Audit: every check and every decision is logged and kept for 7 years.', n.statement = 'Onboarding: when a customer signs up, the system runs identity checks (KYC): name, date of birth, SSN and address are checked against a verification provider.
Screening: sanctions and watch-list screening runs at sign-up and again every night for existing customers.
Payment monitoring: every payment is checked against monitoring rules (large amounts, unusual frequency, new payees). Payments that match a rule are held for the compliance team.
Outcome: the compliance team approves or rejects the held payments and files suspicious activity reports where needed.
Audit: every check and every decision is logged and kept for 7 years.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:48:41.116Z';
MERGE (n:ExpertInput {id: 'expert-module-1-intermediate-4', systemId: 'indian-banking-system'}) SET n.label = 'Which alternative or exception paths are missing from "User Login Flow"?', n.module = 'module-1', n.confidence = 'high', n.question = 'Which alternative or exception paths are missing from "User Login Flow"?', n.answer = 'Forgot password / reset by email or SMS.
Account locked after too many failed attempts.
Extra verification (one-time code) for a new device or unusual location.
First login after sign-up: accept terms and set up security details.
Password expired or too weak: force a change before entering.
Someone else already logged in on another device: notify the customer, with the option to end the other session.
Login service or database unavailable: show a retry message.', n.statement = 'Forgot password / reset by email or SMS.
Account locked after too many failed attempts.
Extra verification (one-time code) for a new device or unusual location.
First login after sign-up: accept terms and set up security details.
Password expired or too weak: force a change before entering.
Someone else already logged in on another device: notify the customer, with the option to end the other session.
Login service or database unavailable: show a retry message.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:48:41.116Z';
MERGE (n:ExpertInput {id: 'expert-module-1-indepth-1', systemId: 'indian-banking-system'}) SET n.label = 'Requirement IN-14 was found only partly implemented. What is the intended beh...', n.module = 'module-1', n.confidence = 'high', n.question = 'Requirement IN-14 was found only partly implemented. What is the intended behaviour, and should the requirement or the system change?', n.answer = 'The intended behaviour is that the main pages (login, home/balance, transaction history, payment form) load in under 2 seconds for 95% of requests at normal traffic. The requirement should stay, but it needs to be more precise. It should say which pages are covered, measure the 95th percentile rather than every request, and allow up to 4 seconds at peak times like month-end salary days. The system should change: add alerts when page load passes 2 seconds and treat this as a release check. Monitoring alone isn’t enough.', n.statement = 'The intended behaviour is that the main pages (login, home/balance, transaction history, payment form) load in under 2 seconds for 95% of requests at normal traffic. The requirement should stay, but it needs to be more precise. It should say which pages are covered, measure the 95th percentile rather than every request, and allow up to 4 seconds at peak times like month-end salary days. The system should change: add alerts when page load passes 2 seconds and treat this as a release check. Monitoring alone isn’t enough.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:49:21.114Z';
MERGE (n:ExpertInput {id: 'expert-module-1-indepth-2', systemId: 'indian-banking-system'}) SET n.label = 'What are the actual requirements here? Please cover: KYC/AML compliance requi...', n.module = 'module-1', n.confidence = 'high', n.question = 'What are the actual requirements here? Please cover: KYC/AML compliance requirements; Customer identity verification process; Transaction monitoring rules.', n.answer = 'KYC/AML: every customer must be verified before they can send or receive money. Sanctions and politically exposed person (PEP) screening runs at sign-up and daily after that. Records are kept for at least 7 years after the account closes.
Identity verification: at sign-up, check name, date of birth, SSN and address with a verification provider, plus a photo ID and selfie check for higher-risk customers. If the check fails, the account stays in “pending verification” and can only view information. Manual review by the onboarding team within 2 business days.
Transaction monitoring: flag single payments over $10,000; several payments adding up to over $10,000 within 24 hours; more than 10 payments to new payees in a day; and payments to high-risk countries. Flagged payments are held for compliance review, and confirmed suspicious activity is reported to the regulator within 30 days.', n.statement = 'KYC/AML: every customer must be verified before they can send or receive money. Sanctions and politically exposed person (PEP) screening runs at sign-up and daily after that. Records are kept for at least 7 years after the account closes.
Identity verification: at sign-up, check name, date of birth, SSN and address with a verification provider, plus a photo ID and selfie check for higher-risk customers. If the check fails, the account stays in “pending verification” and can only view information. Manual review by the onboarding team within 2 business days.
Transaction monitoring: flag single payments over $10,000; several payments adding up to over $10,000 within 24 hours; more than 10 payments to new payees in a day; and payments to high-risk countries. Flagged payments are held for compliance review, and confirmed suspicious activity is reported to the regulator within 30 days.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:49:21.114Z';
MERGE (n:ExpertInput {id: 'expert-module-1-indepth-3', systemId: 'indian-banking-system'}) SET n.label = '"Regulatory Compliance" is not built. What must it do to be complete, and how...', n.module = 'module-1', n.confidence = 'high', n.question = '"Regulatory Compliance" is not built. What must it do to be complete, and how important is it?', n.answer = 'To be complete it needs:

identity checks at sign-up
sanctions screening
transaction monitoring with a review queue for the compliance team
regulatory reporting (suspicious activity and large cash transaction reports)
a full audit log of every decision
data retention controls

It is the highest priority: a blocking item. The bank cannot legally open accounts or move money without it, so it must be in place before go-live, ahead of new features like Cards or Loans.', n.statement = 'To be complete it needs:

identity checks at sign-up
sanctions screening
transaction monitoring with a review queue for the compliance team
regulatory reporting (suspicious activity and large cash transaction reports)
a full audit log of every decision
data retention controls

It is the highest priority: a blocking item. The bank cannot legally open accounts or move money without it, so it must be in place before go-live, ahead of new features like Cards or Loans.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:49:21.114Z';
MERGE (n:ExpertInput {id: 'expert-module-1-indepth-4', systemId: 'indian-banking-system'}) SET n.label = 'Are there back-office or branch staff users who need access?', n.module = 'module-1', n.confidence = 'high', n.question = 'Are there back-office or branch staff users who need access?', n.answer = 'Yes. Four groups need access:

Customer support agents: view customer profiles and accounts, unlock accounts and reset passwords, but not move money.
Branch staff: onboard customers in person and verify ID documents.
Compliance officers: review held payments and file reports.
Operations and finance: run reconciliation and reports.

All staff need separate staff logins with role-based permissions and multi-factor authentication. Every action they take on a customer’s account must be logged.

Questions 3 here and 3 in Level 2 overlap: both are about “Regulatory Compliance”. The generator asks about capabilities that aren’t built at two levels (how it should work, then what it needs to be complete). If you’d rather each topic appear only once, I can change that.

Same as before: saving these writes them to expert-answers.jsonl, so delete that file after testing if you don’t want dummy data in the training set.', n.statement = 'Yes. Four groups need access:

Customer support agents: view customer profiles and accounts, unlock accounts and reset passwords, but not move money.
Branch staff: onboard customers in person and verify ID documents.
Compliance officers: review held payments and file reports.
Operations and finance: run reconciliation and reports.

All staff need separate staff logins with role-based permissions and multi-factor authentication. Every action they take on a customer’s account must be logged.

Questions 3 here and 3 in Level 2 overlap: both are about “Regulatory Compliance”. The generator asks about capabilities that aren’t built at two levels (how it should work, then what it needs to be complete). If you’d rather each topic appear only once, I can change that.

Same as before: saving these writes them to expert-answers.jsonl, so delete that file after testing if you don’t want dummy data in the training set.', n.answeredBy = 'Digital banking product owner', n.answeredAt = '2026-11-12T10:49:21.114Z';
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'module-1', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_MODULE]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'module-2', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_MODULE]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'module-3', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_MODULE]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'module-4', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_MODULE]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'module-5', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_MODULE]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'module-6', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_MODULE]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'dom-identity', systemId: 'indian-banking-system'}) MERGE (a)-[:COVERS_DOMAIN]->(b);
MATCH (a {id: 'dom-identity', systemId: 'indian-banking-system'}), (b {id: 'agg-user', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_AGGREGATE]->(b);
MATCH (a {id: 'agg-user', systemId: 'indian-banking-system'}), (b {id: 'ent-user', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'dom-accounts', systemId: 'indian-banking-system'}) MERGE (a)-[:COVERS_DOMAIN]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'agg-account', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_AGGREGATE]->(b);
MATCH (a {id: 'agg-account', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'agg-account', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'agg-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_AGGREGATE]->(b);
MATCH (a {id: 'agg-contact', systemId: 'indian-banking-system'}), (b {id: 'ent-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'dom-payments', systemId: 'indian-banking-system'}) MERGE (a)-[:COVERS_DOMAIN]->(b);
MATCH (a {id: 'dom-payments', systemId: 'indian-banking-system'}), (b {id: 'agg-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_AGGREGATE]->(b);
MATCH (a {id: 'agg-transaction', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'module-4', systemId: 'indian-banking-system'}), (b {id: 'dom-deposits', systemId: 'indian-banking-system'}) MERGE (a)-[:COVERS_DOMAIN]->(b);
MATCH (a {id: 'dom-deposits', systemId: 'indian-banking-system'}), (b {id: 'agg-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_AGGREGATE]->(b);
MATCH (a {id: 'agg-deposit', systemId: 'indian-banking-system'}), (b {id: 'ent-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'dom-identity', systemId: 'indian-banking-system'}), (b {id: 'ent-user', systemId: 'indian-banking-system'}) MERGE (a)-[:OWNS_ENTITY]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:OWNS_ENTITY]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:OWNS_ENTITY]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'ent-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:OWNS_ENTITY]->(b);
MATCH (a {id: 'dom-payments', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:OWNS_ENTITY]->(b);
MATCH (a {id: 'dom-deposits', systemId: 'indian-banking-system'}), (b {id: 'ent-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:OWNS_ENTITY]->(b);
MATCH (a {id: 'ent-user', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:RELATES_1_1]->(b);
MATCH (a {id: 'ent-account', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:RELATES_1_1]->(b);
MATCH (a {id: 'ent-user', systemId: 'indian-banking-system'}), (b {id: 'ent-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:RELATES_1_N]->(b);
MATCH (a {id: 'ent-account', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:RELATES_1_N]->(b);
MATCH (a {id: 'ent-account', systemId: 'indian-banking-system'}), (b {id: 'ent-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:RELATES_1_N]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-identity', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-user-login', systemId: 'indian-banking-system'}), (b {id: 'svc-userservice', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'act-user-signup', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-identity', systemId: 'indian-banking-system'}), (b {id: 'act-user-signup', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-user-signup', systemId: 'indian-banking-system'}), (b {id: 'svc-userservice', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'act-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'act-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-view-balance', systemId: 'indian-banking-system'}), (b {id: 'svc-balancereader', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'act-add-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'act-add-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-add-contact', systemId: 'indian-banking-system'}), (b {id: 'svc-contacts', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'act-make-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-payments', systemId: 'indian-banking-system'}), (b {id: 'act-make-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-make-payment', systemId: 'indian-banking-system'}), (b {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'act-view-transaction-history', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-payments', systemId: 'indian-banking-system'}), (b {id: 'act-view-transaction-history', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-view-transaction-history', systemId: 'indian-banking-system'}), (b {id: 'svc-transactionhistory', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-4', systemId: 'indian-banking-system'}), (b {id: 'act-make-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-deposits', systemId: 'indian-banking-system'}), (b {id: 'act-make-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'act-validate-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-payments', systemId: 'indian-banking-system'}), (b {id: 'act-validate-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-validate-transaction', systemId: 'indian-banking-system'}), (b {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'act-process-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-payments', systemId: 'indian-banking-system'}), (b {id: 'act-process-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-process-transaction', systemId: 'indian-banking-system'}), (b {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'act-refresh-balance-cache', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-accounts', systemId: 'indian-banking-system'}), (b {id: 'act-refresh-balance-cache', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-refresh-balance-cache', systemId: 'indian-banking-system'}), (b {id: 'svc-balancereader', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'act-authenticate-oauth', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-identity', systemId: 'indian-banking-system'}), (b {id: 'act-authenticate-oauth', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-authenticate-oauth', systemId: 'indian-banking-system'}), (b {id: 'svc-userservice', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'act-logout', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_ACTIVITY]->(b);
MATCH (a {id: 'dom-identity', systemId: 'indian-banking-system'}), (b {id: 'act-logout', systemId: 'indian-banking-system'}) MERGE (a)-[:PERFORMS]->(b);
MATCH (a {id: 'act-logout', systemId: 'indian-banking-system'}), (b {id: 'svc-userservice', systemId: 'indian-banking-system'}) MERGE (a)-[:EXECUTED_BY]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'flow-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FLOW]->(b);
MATCH (a {id: 'flow-user-login', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-user-login', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-user-login', systemId: 'indian-banking-system'}), (b {id: 'ent-user', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-user-login', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-user-login', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'flow-user-signup', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FLOW]->(b);
MATCH (a {id: 'flow-user-signup', systemId: 'indian-banking-system'}), (b {id: 'act-user-signup', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-user-signup', systemId: 'indian-banking-system'}), (b {id: 'act-user-signup', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-user-signup', systemId: 'indian-banking-system'}), (b {id: 'ent-user', systemId: 'indian-banking-system'}) MERGE (a)-[:WRITES]->(b);
MATCH (a {id: 'flow-user-signup', systemId: 'indian-banking-system'}), (b {id: 'act-user-signup', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'flow-make-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FLOW]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'act-make-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'act-validate-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'act-process-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:WRITES]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:WRITES]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'act-refresh-balance-cache', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'act-make-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-payment', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'flow-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FLOW]->(b);
MATCH (a {id: 'flow-view-balance', systemId: 'indian-banking-system'}), (b {id: 'act-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-view-balance', systemId: 'indian-banking-system'}), (b {id: 'act-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-view-balance', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-view-balance', systemId: 'indian-banking-system'}), (b {id: 'act-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-view-balance', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-4', systemId: 'indian-banking-system'}), (b {id: 'flow-make-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FLOW]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'act-make-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'act-make-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'ent-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:WRITES]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:WRITES]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'act-refresh-balance-cache', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'act-make-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:STEP]->(b);
MATCH (a {id: 'flow-make-deposit', systemId: 'indian-banking-system'}), (b {id: 'ent-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'per-customer', systemId: 'indian-banking-system'}), (b {id: 'jrn-customer-login', systemId: 'indian-banking-system'}) MERGE (a)-[:UNDERTAKES]->(b);
MATCH (a {id: 'jrn-customer-login', systemId: 'indian-banking-system'}), (b {id: 'flow-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'per-customer', systemId: 'indian-banking-system'}), (b {id: 'jrn-customer-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:UNDERTAKES]->(b);
MATCH (a {id: 'jrn-customer-payment', systemId: 'indian-banking-system'}), (b {id: 'flow-make-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'per-operator', systemId: 'indian-banking-system'}), (b {id: 'jrn-operator-monitoring', systemId: 'indian-banking-system'}) MERGE (a)-[:UNDERTAKES]->(b);
MATCH (a {id: 'per-engineer', systemId: 'indian-banking-system'}), (b {id: 'jrn-engineer-maintenance', systemId: 'indian-banking-system'}) MERGE (a)-[:UNDERTAKES]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'rep-account-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-account-balance', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'rep-transaction-history', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-transaction-history', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'rep-monthly-statement', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-monthly-statement', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'rep-monthly-statement', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'rep-monthly-statement', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'rep-account-summary', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-account-summary', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'rep-account-summary', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'rep-account-summary', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'rep-account-summary', systemId: 'indian-banking-system'}), (b {id: 'ent-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'rep-payment-failures', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-payment-failures', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-4', systemId: 'indian-banking-system'}), (b {id: 'rep-deposit-summary', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-deposit-summary', systemId: 'indian-banking-system'}), (b {id: 'ent-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'rep-contact-list', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-contact-list', systemId: 'indian-banking-system'}), (b {id: 'ent-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'rep-fraud-detection', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-fraud-detection', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'rep-regulatory-compliance', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'rep-system-health', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'rep-user-activity', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-user-activity', systemId: 'indian-banking-system'}), (b {id: 'ent-user', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-5', systemId: 'indian-banking-system'}), (b {id: 'rep-card-activity', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'module-6', systemId: 'indian-banking-system'}), (b {id: 'rep-loan-status', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'rep-reconciliation', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'rep-reconciliation', systemId: 'indian-banking-system'}), (b {id: 'ent-account', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'rep-reconciliation', systemId: 'indian-banking-system'}), (b {id: 'ent-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'rep-reconciliation', systemId: 'indian-banking-system'}), (b {id: 'ent-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:READS]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'rep-audit-log', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_REPORT]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'cap-user-authentication', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-user-authentication', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'cap-user-authentication', systemId: 'indian-banking-system'}), (b {id: 'act-user-signup', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'cap-user-authentication', systemId: 'indian-banking-system'}), (b {id: 'act-logout', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'cap-account-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-account-management', systemId: 'indian-banking-system'}), (b {id: 'act-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'cap-account-management', systemId: 'indian-banking-system'}), (b {id: 'act-add-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'cap-payment-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-payment-processing', systemId: 'indian-banking-system'}), (b {id: 'act-make-payment', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'cap-payment-processing', systemId: 'indian-banking-system'}), (b {id: 'act-validate-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'cap-payment-processing', systemId: 'indian-banking-system'}), (b {id: 'act-process-transaction', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'module-4', systemId: 'indian-banking-system'}), (b {id: 'cap-deposit-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-deposit-processing', systemId: 'indian-banking-system'}), (b {id: 'act-make-deposit', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'cap-balance-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-balance-management', systemId: 'indian-banking-system'}), (b {id: 'act-view-balance', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'cap-balance-management', systemId: 'indian-banking-system'}), (b {id: 'act-refresh-balance-cache', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'cap-transaction-history', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-transaction-history', systemId: 'indian-banking-system'}), (b {id: 'act-view-transaction-history', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'cap-contact-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-contact-management', systemId: 'indian-banking-system'}), (b {id: 'act-add-contact', systemId: 'indian-banking-system'}) MERGE (a)-[:REALISED_BY]->(b);
MATCH (a {id: 'module-5', systemId: 'indian-banking-system'}), (b {id: 'cap-card-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'module-6', systemId: 'indian-banking-system'}), (b {id: 'cap-loan-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'cap-fraud-detection', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'cap-regulatory-compliance', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'cap-audit-logging', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_CAPABILITY]->(b);
MATCH (a {id: 'cap-user-authentication', systemId: 'indian-banking-system'}), (b {id: 'epic-identity-management', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'cap-regulatory-compliance', systemId: 'indian-banking-system'}), (b {id: 'epic-identity-management', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'cap-audit-logging', systemId: 'indian-banking-system'}), (b {id: 'epic-identity-management', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'epic-identity-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EPIC]->(b);
MATCH (a {id: 'epic-identity-management', systemId: 'indian-banking-system'}), (b {id: 'feat-multi-factor-auth', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-multi-factor-auth', systemId: 'indian-banking-system'}), (b {id: 'story-001', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-multi-factor-auth', systemId: 'indian-banking-system'}), (b {id: 'story-002', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-multi-factor-auth', systemId: 'indian-banking-system'}), (b {id: 'story-003', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-identity-management', systemId: 'indian-banking-system'}), (b {id: 'feat-session-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-session-management', systemId: 'indian-banking-system'}), (b {id: 'story-004', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-session-management', systemId: 'indian-banking-system'}), (b {id: 'story-005', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-identity-management', systemId: 'indian-banking-system'}), (b {id: 'feat-audit-logging', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-audit-logging', systemId: 'indian-banking-system'}), (b {id: 'story-006', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-audit-logging', systemId: 'indian-banking-system'}), (b {id: 'story-007', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'cap-account-management', systemId: 'indian-banking-system'}), (b {id: 'epic-account-management', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'cap-balance-management', systemId: 'indian-banking-system'}), (b {id: 'epic-account-management', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'module-2', systemId: 'indian-banking-system'}), (b {id: 'epic-account-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EPIC]->(b);
MATCH (a {id: 'epic-account-management', systemId: 'indian-banking-system'}), (b {id: 'feat-account-summary', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-account-summary', systemId: 'indian-banking-system'}), (b {id: 'story-008', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-account-summary', systemId: 'indian-banking-system'}), (b {id: 'story-009', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-account-management', systemId: 'indian-banking-system'}), (b {id: 'feat-monthly-statements', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-monthly-statements', systemId: 'indian-banking-system'}), (b {id: 'story-010', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-monthly-statements', systemId: 'indian-banking-system'}), (b {id: 'story-011', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-account-management', systemId: 'indian-banking-system'}), (b {id: 'feat-contact-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-contact-management', systemId: 'indian-banking-system'}), (b {id: 'story-012', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-contact-management', systemId: 'indian-banking-system'}), (b {id: 'story-013', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'cap-payment-processing', systemId: 'indian-banking-system'}), (b {id: 'epic-payment-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'cap-fraud-detection', systemId: 'indian-banking-system'}), (b {id: 'epic-payment-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'module-3', systemId: 'indian-banking-system'}), (b {id: 'epic-payment-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EPIC]->(b);
MATCH (a {id: 'epic-payment-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-scheduled-payments', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-scheduled-payments', systemId: 'indian-banking-system'}), (b {id: 'story-014', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-scheduled-payments', systemId: 'indian-banking-system'}), (b {id: 'story-015', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-payment-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-fraud-detection', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-fraud-detection', systemId: 'indian-banking-system'}), (b {id: 'story-016', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-fraud-detection', systemId: 'indian-banking-system'}), (b {id: 'story-017', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-payment-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-payment-validation', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-payment-validation', systemId: 'indian-banking-system'}), (b {id: 'story-018', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-payment-validation', systemId: 'indian-banking-system'}), (b {id: 'story-019', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'cap-deposit-processing', systemId: 'indian-banking-system'}), (b {id: 'epic-deposit-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'module-4', systemId: 'indian-banking-system'}), (b {id: 'epic-deposit-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EPIC]->(b);
MATCH (a {id: 'epic-deposit-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-deposit-tracking', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-deposit-tracking', systemId: 'indian-banking-system'}), (b {id: 'story-020', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-deposit-tracking', systemId: 'indian-banking-system'}), (b {id: 'story-021', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-deposit-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-deposit-verification', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-deposit-verification', systemId: 'indian-banking-system'}), (b {id: 'story-022', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-deposit-verification', systemId: 'indian-banking-system'}), (b {id: 'story-023', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-deposit-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-deposit-reporting', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-deposit-reporting', systemId: 'indian-banking-system'}), (b {id: 'story-024', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-deposit-reporting', systemId: 'indian-banking-system'}), (b {id: 'story-025', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'cap-card-management', systemId: 'indian-banking-system'}), (b {id: 'epic-card-management', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'module-5', systemId: 'indian-banking-system'}), (b {id: 'epic-card-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EPIC]->(b);
MATCH (a {id: 'epic-card-management', systemId: 'indian-banking-system'}), (b {id: 'feat-card-issuance', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-card-issuance', systemId: 'indian-banking-system'}), (b {id: 'story-026', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-card-issuance', systemId: 'indian-banking-system'}), (b {id: 'story-027', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-card-management', systemId: 'indian-banking-system'}), (b {id: 'feat-card-management', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-card-management', systemId: 'indian-banking-system'}), (b {id: 'story-028', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-card-management', systemId: 'indian-banking-system'}), (b {id: 'story-029', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-card-management', systemId: 'indian-banking-system'}), (b {id: 'feat-card-activity', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-card-activity', systemId: 'indian-banking-system'}), (b {id: 'story-030', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-card-activity', systemId: 'indian-banking-system'}), (b {id: 'story-031', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'cap-loan-processing', systemId: 'indian-banking-system'}), (b {id: 'epic-loan-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:DELIVERED_BY]->(b);
MATCH (a {id: 'module-6', systemId: 'indian-banking-system'}), (b {id: 'epic-loan-processing', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EPIC]->(b);
MATCH (a {id: 'epic-loan-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-loan-origination', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-loan-origination', systemId: 'indian-banking-system'}), (b {id: 'story-032', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-loan-origination', systemId: 'indian-banking-system'}), (b {id: 'story-033', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-loan-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-loan-servicing', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-loan-servicing', systemId: 'indian-banking-system'}), (b {id: 'story-034', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-loan-servicing', systemId: 'indian-banking-system'}), (b {id: 'story-035', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'epic-loan-processing', systemId: 'indian-banking-system'}), (b {id: 'feat-loan-analytics', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_FEATURE]->(b);
MATCH (a {id: 'feat-loan-analytics', systemId: 'indian-banking-system'}), (b {id: 'story-036', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'feat-loan-analytics', systemId: 'indian-banking-system'}), (b {id: 'story-037', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_STORY]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'svc-frontend', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'svc-userservice', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'svc-balancereader', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'svc-contacts', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'svc-transactionhistory', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'ds-accounts-db', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'ds-ledger-db', systemId: 'indian-banking-system'}) MERGE (a)-[:CONTAINS]->(b);
MATCH (a {id: 'svc-frontend', systemId: 'indian-banking-system'}), (b {id: 'svc-userservice', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-frontend', systemId: 'indian-banking-system'}), (b {id: 'svc-balancereader', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-frontend', systemId: 'indian-banking-system'}), (b {id: 'svc-contacts', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-frontend', systemId: 'indian-banking-system'}), (b {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-frontend', systemId: 'indian-banking-system'}), (b {id: 'svc-transactionhistory', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-balancereader', systemId: 'indian-banking-system'}), (b {id: 'ds-ledger-db', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-ledgerwriter', systemId: 'indian-banking-system'}), (b {id: 'ds-ledger-db', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-transactionhistory', systemId: 'indian-banking-system'}), (b {id: 'ds-ledger-db', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-userservice', systemId: 'indian-banking-system'}), (b {id: 'ds-accounts-db', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'svc-contacts', systemId: 'indian-banking-system'}), (b {id: 'ds-accounts-db', systemId: 'indian-banking-system'}) MERGE (a)-[:CALLS]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'int-gcp-metadata', systemId: 'indian-banking-system'}) MERGE (a)-[:INTEGRATES_WITH]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'int-gcp-trace', systemId: 'indian-banking-system'}) MERGE (a)-[:INTEGRATES_WITH]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'int-gcp-monitoring', systemId: 'indian-banking-system'}) MERGE (a)-[:INTEGRATES_WITH]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'int-gcp-logging', systemId: 'indian-banking-system'}) MERGE (a)-[:INTEGRATES_WITH]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'int-oauth', systemId: 'indian-banking-system'}) MERGE (a)-[:INTEGRATES_WITH]->(b);
MATCH (a {id: 'indian-banking-system', systemId: 'indian-banking-system'}), (b {id: 'int-external-banks', systemId: 'indian-banking-system'}) MERGE (a)-[:INTEGRATES_WITH]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-introductory-1', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-introductory-1', systemId: 'indian-banking-system'}), (b {id: 'module-1', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-introductory-2', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-introductory-2', systemId: 'indian-banking-system'}), (b {id: 'per-customer', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-introductory-3', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-introductory-3', systemId: 'indian-banking-system'}), (b {id: 'cap-user-authentication', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-introductory-4', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-introductory-4', systemId: 'indian-banking-system'}), (b {id: 'ent-user', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-intermediate-1', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-intermediate-2', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-intermediate-2', systemId: 'indian-banking-system'}), (b {id: 'act-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-intermediate-3', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-intermediate-3', systemId: 'indian-banking-system'}), (b {id: 'cap-regulatory-compliance', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-intermediate-4', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-intermediate-4', systemId: 'indian-banking-system'}), (b {id: 'flow-user-login', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-indepth-1', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-indepth-2', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-indepth-3', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-indepth-3', systemId: 'indian-banking-system'}), (b {id: 'cap-regulatory-compliance', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
MATCH (a {id: 'module-1', systemId: 'indian-banking-system'}), (b {id: 'expert-module-1-indepth-4', systemId: 'indian-banking-system'}) MERGE (a)-[:HAS_EXPERT_INPUT]->(b);
MATCH (a {id: 'expert-module-1-indepth-4', systemId: 'indian-banking-system'}), (b {id: 'module-1', systemId: 'indian-banking-system'}) MERGE (a)-[:CLARIFIES]->(b);
