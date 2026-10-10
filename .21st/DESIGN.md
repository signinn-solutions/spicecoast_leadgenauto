# Signinn Leadgen design context

The platform console manages customer tenants. Tenant workspaces retain the existing CRM and mailbox UI. SpiceCoast is one customer, not the platform identity.

React and Vite; compact light UI. Reuse CSS variables and controls in frontend/src/styles.css: --purple, --bg-base, --bg-surface-1, --text-main, --text-secondary, --border-subtle; lf-panel, lf-input, lf-select, lf-crm-table and existing button classes.

Platform navigation: overview, tenants, subscription plans, platform administrators, audit. Tenant management uses the existing AdminView with a tenant-scoped API base. Customer workspace navigation retains discovery, CRM, outreach, mailbox and analytics, without Administration. Viewers have read-only controls. Subscription status is read-only in the customer workspace.

Use semantic buttons, labelled forms, responsive navigation and visible focus. Server authorization owns role and tenant boundaries.

Super admin management uses one visible section at a time. Forms keep actions on a separate full-width row, tables scroll inside bounded containers, and effective subscription access is shown explicitly. Platform CSS changes remain scoped to lf-platform-shell.
