# DossierBox

A mobile-first career document platform built around a reusable professional Dossier.

DossierBox is designed to give users a single source of truth for their career information, which can then be used to create and manage tailored career documents.

> **Status:** Active development

## Overview

Most career-document tools start with a blank CV and ask users to repeatedly enter the same information.

DossierBox takes a different approach.

The user builds a reusable **Dossier** containing their professional information. That information can then support the creation and management of career documents without repeatedly starting from scratch.

The project is being developed as a full-stack web application with a focus on clear workflows, structured data, responsive interfaces, and maintainable application architecture.

## Core Features

- Reusable professional Dossier
- Profile and career information management
- CV/document creation workflows
- Document rendering
- Profile import functionality
- Authenticated user workflows
- PostgreSQL-backed application data
- Responsive, mobile-first interface
- Database migrations and structured persistence
- Reusable UI and application components

## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend & Data

- Next.js Server Actions
- PostgreSQL
- Drizzle ORM
- REST/API integrations where appropriate

### Authentication

- NextAuth

### Development & Deployment

- Git
- GitHub
- Vercel
- VS Code

## Architecture

DossierBox uses a modern Next.js application architecture with a PostgreSQL database and Drizzle ORM for persistence.

The application separates user-facing workflows from data persistence and server-side operations while keeping the interface responsive across mobile and desktop layouts.

Key areas include:

```text
User Interface
      │
      ▼
Application Workflows
      │
      ├── Profile / Dossier
      ├── Documents
      ├── Import
      └── Authentication
      │
      ▼
Server Actions / Server Logic
      │
      ▼
Drizzle ORM
      │
      ▼
<<<<<<< HEAD
PostgreSQL
=======
PostgreSQL
````

## Development Focus

Current development focuses on:

* Stabilizing core Dossier workflows
* Improving document creation and rendering
* Strengthening data consistency between UI and database state
* Refining authentication and authenticated navigation
* Improving responsive and mobile-first UX
* Simplifying application flows
* Testing and resolving edge cases across profile and document workflows

## Engineering Considerations

The project has involved working through real application-level problems rather than only implementing isolated UI components.

Examples include:

* Database migration and schema changes
* Authentication state
* Persisted application state
* Profile and document data relationships
* Import and data normalization
* Server/client boundaries in Next.js
* Responsive interaction patterns
* Debugging inconsistent UI state
* Iterative UX refinement

## Project Structure

The codebase is organized around the application's primary product domains and shared application infrastructure.

```text
src/
├── app/
├── components/
├── lib/
├── actions/
└── ...
```

The exact structure continues to evolve as the application is developed.

## Running Locally

### Prerequisites

* Node.js
* PostgreSQL database
* npm

### Installation

```bash
git clone https://github.com/CodeBruv/DossierBox.git

cd DossierBox

npm install
```

### Environment Variables

Create a local environment file and provide the required application and database configuration.

```env
DATABASE_URL=
DATABASE_DIRECT_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

Additional environment variables may be required depending on the authentication and deployment configuration.

### Development

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:3000
```

## Deployment

The application is deployed using Vercel.

Live application:

[https://dossier-box.vercel.app](https://dossier-box.vercel.app)

## Project Goals

DossierBox is being built around a simple idea:

> **Build your professional information once. Reuse it whenever you apply.**

The long-term goal is to make career-document creation feel less like repeatedly filling out forms and more like working from a structured professional source of truth.

## Author

**Abdulmajid Abubakar Hussain**

Frontend Engineer
React · Next.js · TypeScript

* GitHub: [https://github.com/CodeBruv](https://github.com/CodeBruv)
* Portfolio: [https://codebruv.vercel.app](https://codebruv.vercel.app)
>>>>>>> bed7809f39b31d6385f50bedbf405040c3731234
