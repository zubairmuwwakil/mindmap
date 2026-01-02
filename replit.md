# ThoughtMapper

## Overview

ThoughtMapper is a visual thinking application that allows users to create and organize ideas on an infinite canvas. Users can map out their thought processes using connected nodes (bubbles) representing proposals, ideas, and steps. The application provides a node-based flow visualization where thoughts can be linked together to form structured thinking maps that persist to a PostgreSQL database.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, bundled via Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and data fetching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Canvas Visualization**: @xyflow/react (React Flow) for the infinite canvas with draggable, connectable nodes

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Build**: esbuild for server bundling, Vite for client
- **API Pattern**: RESTful JSON API under `/api/*` prefix
- **Development**: Hot module replacement via Vite middleware in development mode

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization
- **Tables**:
  - `users`: User accounts with UUID primary keys
  - `maps`: Thought maps storing nodes/edges as JSONB arrays

### API Structure
- `GET /api/maps` - List all maps
- `GET /api/maps/:id` - Get single map
- `POST /api/maps` - Create new map
- `PATCH /api/maps/:id` - Update existing map
- `DELETE /api/maps/:id` - Delete map

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/` directory are used by both client and server
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod
- **Path Aliases**: `@/` for client source, `@shared/` for shared code

## External Dependencies

### Database
- PostgreSQL database (connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe database operations
- connect-pg-simple for session storage capability

### UI Libraries
- Radix UI primitives (dialog, popover, tooltip, etc.)
- Lucide React for icons
- React Day Picker for calendar functionality
- Embla Carousel for carousels
- Recharts for data visualization
- Vaul for drawer components

### Development Tools
- Replit-specific Vite plugins for development experience
- Custom meta images plugin for OpenGraph tags