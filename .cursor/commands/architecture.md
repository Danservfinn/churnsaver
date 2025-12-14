## Architecture

### Overview

The project is structured as a monorepo using Turborepo. It consists of several packages, each with its own responsibilities:

- **apps/web**: The main web application built with Next.js.
- **packages/db**: Database schema and migrations.
- **packages/ui**: Shared UI components.
- **packages/utils**: Shared utility functions.
- **packages/config**: Shared configuration files.
- **packages/queue**: Queue processing logic.
- **packages/email**: Email sending logic.
- **packages/analytics**: Analytics tracking logic.

### Database

The project uses PostgreSQL as its primary database. The database schema is defined in the `packages/db` package. Migrations are handled using Prisma.

### Queue

The project uses BullMQ as its queue system. The queue processing logic is defined in the `packages/queue` package. The queue is used to process various tasks such as sending emails, tracking analytics, and processing company data.

### Email

The project uses Resend as its email service. The email sending logic is defined in the `packages/email` package. The email service is used to send various emails such as welcome emails, password reset emails, and notification emails.

### Analytics


