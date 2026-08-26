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
PostgreSQL