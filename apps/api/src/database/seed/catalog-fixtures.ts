export interface SeedCategory {
  name: string;
  slug: string;
  description: string;
}

export interface SeedLesson {
  title: string;
  description: string;
  lessonType: 'VIDEO' | 'TEXT' | 'PDF';
  position: number;
  durationSeconds: number;
  isPreview: boolean;
  content?: string;
}

export interface SeedModule {
  title: string;
  description: string;
  position: number;
  lessons: SeedLesson[];
}

export interface SeedCourse {
  title: string;
  slug: string;
  categorySlug: string;
  shortDescription: string;
  description: string;
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  visibility: 'PUBLIC' | 'PRIVATE';
  price: string;
  currency: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL_LEVELS';
  language: string;
  durationMinutes: number;
  publishedAt: string;
  modules: SeedModule[];
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    name: 'Game Development',
    slug: 'game-development',
    description: 'Master game engines, 3D modeling, and interactive gameplay design.',
  },
  {
    name: 'AI Development',
    slug: 'ai-development',
    description: 'Explore machine learning, neural networks, and modern AI engineering.',
  },
  {
    name: 'Robotics',
    slug: 'robotics',
    description: 'Build autonomous robots with Arduino, Raspberry Pi, and embedded hardware.',
  },
  {
    name: 'Mobile App Development',
    slug: 'mobile-app-development',
    description: 'Create cross-platform mobile apps for iOS and Android with Flutter and Swift.',
  },
  {
    name: 'Web Development',
    slug: 'web-development',
    description:
      'Learn full-stack web engineering with modern frameworks and robust backend architectures.',
  },
  {
    name: 'Web Design',
    slug: 'web-design',
    description: 'Design responsive, accessible, and visually stunning digital user experiences.',
  },
];

export const SEED_COURSES: SeedCourse[] = [
  {
    title: 'Unity Game Development',
    slug: 'unity-game-development',
    categorySlug: 'game-development',
    shortDescription:
      'Learn how to build interactive 2D and 3D games using Unity from installation to your first playable level.',
    description:
      "Learn how to build interactive 2D and 3D games using Unity. This beginner-friendly course takes you from installation to creating your first playable level. You'll learn about scenes, physics, assets, and scripting with C#. By the end, you’ll have built your own game and gained the skills to continue exploring advanced Unity features.",
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'BEGINNER',
    language: 'English',
    durationMinutes: 720,
    publishedAt: '2026-01-15T00:00:00.000Z',
    modules: [
      {
        title: 'Unity Engine Foundations',
        description: 'Understand the Unity interface, project setup, and 3D world navigation.',
        position: 1,
        lessons: [
          {
            title: 'Installation & Editor Tour',
            description: 'Install Unity Hub, setup editor layouts, and navigate 3D game scenes.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 600,
            isPreview: true,
          },
          {
            title: 'GameObjects, Components & Physics',
            description:
              'Deep dive into Unity GameObject architecture, rigidbodies, and collision detection.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 450,
            isPreview: false,
            content:
              'GameObjects represent all entities in Unity. Learn how transform, mesh renderer, and colliders interact.',
          },
        ],
      },
      {
        title: 'Gameplay Programming with C#',
        description:
          'Implement character movement, gameplay loops, and interactive game mechanics.',
        position: 2,
        lessons: [
          {
            title: 'Player Controller Scripting',
            description:
              'Write C# scripts to handle keyboard and controller input for fluid character motion.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 840,
            isPreview: false,
          },
          {
            title: 'Game Loop & Level Export',
            description:
              'Finalize your playable game level, build executable binaries, and optimize performance.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 500,
            isPreview: false,
            content:
              'Exporting your Unity project for desktop platforms: quality settings, resolution scaling, and asset bundle packaging.',
          },
        ],
      },
    ],
  },
  {
    title: 'AI with Python: Building Smart Applications',
    slug: 'ai-with-python-building-smart-applications',
    categorySlug: 'ai-development',
    shortDescription:
      'Step into the world of artificial intelligence with Python, machine learning, and neural networks.',
    description:
      'Step into the world of artificial intelligence with this Python-based course. You’ll learn the fundamentals of machine learning, neural networks, and natural language processing. Through projects, you’ll train models, analyze data, and build AI-driven applications. By the end, you’ll have the skills to start building real-world AI solutions.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'INTERMEDIATE',
    language: 'English',
    durationMinutes: 1200,
    publishedAt: '2026-01-20T00:00:00.000Z',
    modules: [
      {
        title: 'Mathematical Foundations & Data Preprocessing',
        description:
          'Prepare tabular datasets and implement core linear algebra routines in NumPy and pandas.',
        position: 1,
        lessons: [
          {
            title: 'NumPy Vectorization & Data Cleaning',
            description:
              'Vectorized mathematical operations, missing value imputation, and feature engineering.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 720,
            isPreview: true,
          },
          {
            title: 'Supervised Learning Fundamentals',
            description:
              'Mathematical intuition behind linear regression, logistic classification, and decision trees.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 500,
            isPreview: false,
            content:
              'Supervised learning overview: loss functions, gradient descent optimization, and cross-validation techniques.',
          },
        ],
      },
      {
        title: 'Neural Networks & Deep Learning',
        description:
          'Construct multi-layer perceptrons and train computer vision models with PyTorch.',
        position: 2,
        lessons: [
          {
            title: 'PyTorch Model Training Pipeline',
            description:
              'Building custom nn.Module architectures, dataloaders, and backpropagation loops.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 960,
            isPreview: false,
          },
          {
            title: 'Model Evaluation & Inference APIs',
            description:
              'Exporting trained PyTorch models to ONNX and deploying inference endpoints.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 600,
            isPreview: false,
            content:
              'Production inference best practices: batching, quantization, and REST API deployment with FastAPI.',
          },
        ],
      },
    ],
  },
  {
    title: 'Arduino Robotics for Beginners',
    slug: 'arduino-robotics-for-beginners',
    categorySlug: 'robotics',
    shortDescription:
      'Hands-on robotics with Arduino: control motors, sensors, and servos to build your first robots.',
    description:
      "Dive into robotics with this hands-on course using Arduino. Learn how to control motors, sensors, and servos to bring your robots to life. You'll build small robotic projects and gain the knowledge to create more advanced robots in the future. A perfect entry point for robotics enthusiasts and students.",
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'BEGINNER',
    language: 'English',
    durationMinutes: 900,
    publishedAt: '2026-02-01T00:00:00.000Z',
    modules: [
      {
        title: 'Microcontroller Architecture & Circuit Basics',
        description:
          'Introduction to breadboards, circuit schematics, and Arduino microcontroller programming.',
        position: 1,
        lessons: [
          {
            title: 'Arduino Hardware & IDE Overview',
            description:
              'Connecting Arduino Uno, digital and analog I/O pins, and flashing your first sketch.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 540,
            isPreview: true,
          },
          {
            title: 'Sensor Interfacing & Pulse Width Modulation',
            description:
              'Reading ultrasonic distance sensors, analog potentiometers, and controlling PWM signals.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 420,
            isPreview: false,
            content:
              'Pulse Width Modulation (PWM) basics for controlling LED intensity and DC motor speeds safely.',
          },
        ],
      },
      {
        title: 'Autonomous Mobile Robot Construction',
        description: 'Assemble a two-wheeled robotic chassis with obstacle avoidance capabilities.',
        position: 2,
        lessons: [
          {
            title: 'H-Bridge Motor Driver Wiring & Control',
            description:
              'Wire an L298N H-bridge driver and program directional steering algorithms.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 780,
            isPreview: false,
          },
          {
            title: 'Obstacle Avoidance Firmware Architecture',
            description:
              'State machine implementation for scanning surroundings and avoiding obstacles in real-time.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 480,
            isPreview: false,
            content:
              'Writing non-blocking Arduino code using millis() timers instead of delay() for real-time responsiveness.',
          },
        ],
      },
    ],
  },
  {
    title: 'Flutter App Development',
    slug: 'flutter-app-development',
    categorySlug: 'mobile-app-development',
    shortDescription:
      'Build beautiful, cross-platform iOS and Android mobile apps from a single Dart codebase.',
    description:
      'Master cross-platform mobile development with Google Flutter. Learn Dart programming, reactive UI composition with widgets, state management architectures, and hardware integration. Build polished, production-ready apps for iOS and Android.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'BEGINNER',
    language: 'English',
    durationMinutes: 1080,
    publishedAt: '2026-02-10T00:00:00.000Z',
    modules: [
      {
        title: 'Dart Syntax & Widget Composition',
        description: 'Core Dart object-oriented features and declarative Flutter widget trees.',
        position: 1,
        lessons: [
          {
            title: 'Flutter Setup & Stateless vs Stateful Widgets',
            description: 'Hot reload workflow, material design components, and lifecycle methods.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 660,
            isPreview: true,
          },
          {
            title: 'Responsive Layouts & Navigation',
            description: 'Using Row, Column, Expanded, and Flutter Navigator 2.0 routing.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 420,
            isPreview: false,
            content:
              'Designing responsive mobile viewports using LayoutBuilder and MediaQuery across device sizes.',
          },
        ],
      },
      {
        title: 'State Management & REST Integration',
        description: 'Managing reactive application state and consuming remote APIs.',
        position: 2,
        lessons: [
          {
            title: 'Riverpod State Management',
            description:
              'Decoupling business logic with providers, state notifiers, and async value handling.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 840,
            isPreview: false,
          },
          {
            title: 'Secure Local Storage & App Publishing',
            description:
              'Persisting offline data with SQLite/Hive and compiling release APKs and IPAs.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 520,
            isPreview: false,
            content:
              'Step-by-step checklist for signing certificates, ProGuard rules, and submitting to Apple App Store and Google Play.',
          },
        ],
      },
    ],
  },
  {
    title: 'Full-Stack Web Development',
    slug: 'full-stack-web-development',
    categorySlug: 'web-development',
    shortDescription:
      'Master full-stack engineering with modern JavaScript, Node.js, relational databases, and React.',
    description:
      'Comprehensive full-stack development curriculum spanning frontend user interfaces, backend REST APIs, relational database modeling, and automated cloud deployments.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'ALL_LEVELS',
    language: 'English',
    durationMinutes: 1800,
    publishedAt: '2026-02-15T00:00:00.000Z',
    modules: [
      {
        title: 'Backend API Design & Relational Databases',
        description: 'Design robust RESTful APIs with Node.js, Express, and PostgreSQL.',
        position: 1,
        lessons: [
          {
            title: 'REST Architecture & Middleware Pipeline',
            description:
              'Designing clean route handlers, input validation schemas, and error filters.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 780,
            isPreview: true,
          },
          {
            title: 'Database Normalization & Indexing',
            description:
              'PostgreSQL relational schemas, foreign key constraints, and query plan optimization.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 480,
            isPreview: false,
            content:
              'Third normal form (3NF) relational design, B-Tree indexing, and transaction isolation levels.',
          },
        ],
      },
      {
        title: 'Frontend React Architecture & Full-Stack Integration',
        description:
          'Build performant, typed user interfaces with React, TypeScript, and stateful hooks.',
        position: 2,
        lessons: [
          {
            title: 'React Custom Hooks & Server State',
            description: 'Data synchronization with TanStack Query and optimistic UI updates.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 900,
            isPreview: false,
          },
          {
            title: 'Authentication & Session Security',
            description:
              'Securing web applications with HttpOnly cookies, CSRF tokens, and role-based guards.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 560,
            isPreview: false,
            content:
              'Defense-in-depth security best practices: HttpOnly flags, SameSite strict cookie attributes, and CSP headers.',
          },
        ],
      },
    ],
  },
  {
    title: 'Unreal Engine Game Design',
    slug: 'unreal-engine-game-design',
    categorySlug: 'game-development',
    shortDescription:
      'Create AAA-quality game environments and gameplay mechanics using Unreal Engine 5 and Blueprints.',
    description:
      'Learn the cutting-edge capabilities of Unreal Engine 5. Discover Nanite virtualized geometry, Lumen real-time global illumination, and visual scripting with Blueprints.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'INTERMEDIATE',
    language: 'English',
    durationMinutes: 1500,
    publishedAt: '2026-02-20T00:00:00.000Z',
    modules: [
      {
        title: 'UE5 Lighting, Nanite & Level Dressing',
        description:
          'Harness Lumen dynamic lighting and Nanite mesh streaming for photorealistic scenes.',
        position: 1,
        lessons: [
          {
            title: 'Nanite Geometry & Lumen Setup',
            description:
              'Importing high-poly meshes, adjusting skylights, and configuring dynamic reflections.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 720,
            isPreview: true,
          },
          {
            title: 'Landscape Sculpting & Material Layering',
            description:
              'Creating layered terrain materials with landscape coords and height blending.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 460,
            isPreview: false,
            content:
              'Mastering PBR landscape materials, layer weight blends, and procedural vegetation scattering.',
          },
        ],
      },
      {
        title: 'Visual Scripting with Blueprints',
        description: 'Construct interactive gameplay systems without writing C++ code.',
        position: 2,
        lessons: [
          {
            title: 'Character Movement & Animation State Machines',
            description: 'Setting up enhanced input actions, blend spaces, and animation montages.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 900,
            isPreview: false,
          },
          {
            title: 'Game Mode, HUD & Audio Integration',
            description:
              'Implementing score systems, health displays via UMG, and spatial audio cues.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 510,
            isPreview: false,
            content:
              'Blueprints communication patterns: Event dispatchers, interfaces, and direct casting strategies.',
          },
        ],
      },
    ],
  },
  {
    title: 'AI-Powered Chatbot Development',
    slug: 'ai-powered-chatbot-development',
    categorySlug: 'ai-development',
    shortDescription:
      'Design, train, and deploy enterprise conversational AI agents using modern LLM APIs and RAG pipelines.',
    description:
      'Learn how to architect modern intelligent conversational agents. This course covers Retrieval-Augmented Generation (RAG), vector embeddings, semantic vector search, and conversational memory.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'INTERMEDIATE',
    language: 'English',
    durationMinutes: 960,
    publishedAt: '2026-03-01T00:00:00.000Z',
    modules: [
      {
        title: 'Embeddings & Vector Databases',
        description:
          'Generate semantic embeddings and store high-dimensional vectors for fast similarity search.',
        position: 1,
        lessons: [
          {
            title: 'Vector Embeddings & Cosine Similarity',
            description:
              'Understanding semantic vector spaces, embedding models, and indexing strategies.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 600,
            isPreview: true,
          },
          {
            title: 'PostgreSQL pgvector Setup & Queries',
            description:
              'Configuring HNSW and IVFFlat indexes in PostgreSQL for high-speed nearest-neighbor retrieval.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 440,
            isPreview: false,
            content:
              'Using PostgreSQL pgvector extension: Euclidean distance vs cosine similarity and index trade-offs.',
          },
        ],
      },
      {
        title: 'Retrieval-Augmented Generation (RAG) Architecture',
        description:
          'Build production-ready context injection pipelines with grounding and evaluation.',
        position: 2,
        lessons: [
          {
            title: 'Building the Context Retrieval Pipeline',
            description: 'Document chunking strategies, reranking, and dynamic prompt assembly.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 840,
            isPreview: false,
          },
          {
            title: 'Hallucination Mitigation & Output Guardrails',
            description:
              'Implementing deterministic validation, schema enforcement, and confidence scoring.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 520,
            isPreview: false,
            content:
              'Best practices for evaluating RAG response fidelity, citation generation, and security prompt injection defenses.',
          },
        ],
      },
    ],
  },
  {
    title: 'Robotics with Raspberry Pi',
    slug: 'robotics-with-raspberry-pi',
    categorySlug: 'robotics',
    shortDescription:
      'Develop intelligent robotic systems with computer vision and Linux hardware on Raspberry Pi.',
    description:
      'Harness the processing power of single-board computers for advanced robotics. Interface hardware sensors with GPIO, perform real-time computer vision with OpenCV, and run autonomous navigation routines.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'ADVANCED',
    language: 'English',
    durationMinutes: 1320,
    publishedAt: '2026-03-05T00:00:00.000Z',
    modules: [
      {
        title: 'Raspberry Pi OS & GPIO Interfacing',
        description:
          'Headless Linux configuration and low-level hardware control using Python gpiozero.',
        position: 1,
        lessons: [
          {
            title: 'Headless Setup & GPIO Programming',
            description:
              'SSH remote management, I2C and SPI protocol enabling, and sensor reading.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 660,
            isPreview: true,
          },
          {
            title: 'Linux Real-Time Kernel Concepts',
            description:
              'Understanding process priorities, thread synchronization, and deterministic hardware polling.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 450,
            isPreview: false,
            content:
              'Managing jitter in user space Linux: using POSIX timers and dedicated daemon threads for sensor loops.',
          },
        ],
      },
      {
        title: 'Computer Vision & Autonomous Following',
        description: 'Track visual targets in real time using Raspberry Pi Camera and OpenCV.',
        position: 2,
        lessons: [
          {
            title: 'OpenCV Color Tracking & Contour Detection',
            description:
              'Processing camera frames, HSV color filtering, and calculating object centroid coordinates.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 900,
            isPreview: false,
          },
          {
            title: 'PID Controller Implementation for Steering',
            description:
              'Tuning proportional, integral, and derivative coefficients for smooth motorized target tracking.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 540,
            isPreview: false,
            content:
              'Mathematical formulation of PID loops for closed-loop differential drive robot steering control.',
          },
        ],
      },
    ],
  },
  {
    title: 'iOS App Development with Swift',
    slug: 'ios-app-development-with-swift',
    categorySlug: 'mobile-app-development',
    shortDescription:
      'Build native iOS applications with Swift, SwiftUI, Combine, and modern Apple platform SDKs.',
    description:
      'Learn native Apple software engineering from the ground up. This course covers Swift modern syntax, declarative SwiftUI view hierarchies, state binding, and App Store submission workflows.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'INTERMEDIATE',
    language: 'English',
    durationMinutes: 1200,
    publishedAt: '2026-03-10T00:00:00.000Z',
    modules: [
      {
        title: 'SwiftUI Architecture & State Management',
        description:
          'Declarative user interfaces using SwiftUI View protocols and property wrappers.',
        position: 1,
        lessons: [
          {
            title: 'SwiftUI Views, Modifiers & Previews',
            description:
              'Composing stacks, text fields, lists, and real-time Xcode Canvas previews.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 600,
            isPreview: true,
          },
          {
            title: '@State, @Binding & @Observable',
            description:
              'Understanding value semantics and reactive data flow in iOS 17+ applications.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 460,
            isPreview: false,
            content:
              'Data flow in SwiftUI: Single source of truth patterns using @Observable macro and environment objects.',
          },
        ],
      },
      {
        title: 'Networking, SwiftData & Release',
        description:
          'Persistent local storage with SwiftData and asynchronous networking with async/await.',
        position: 2,
        lessons: [
          {
            title: 'Async/Await Networking & JSON Parsing',
            description:
              'Fetching remote APIs using URLSession with modern structured concurrency.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 840,
            isPreview: false,
          },
          {
            title: 'SwiftData Models & App Store Preparation',
            description:
              'Defining @Model classes, handling schema migrations, and configuring App Store Connect.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 520,
            isPreview: false,
            content:
              'Configuring App Store metadata, privacy manifests, signing certificates, and TestFlight beta distribution.',
          },
        ],
      },
    ],
  },
  {
    title: 'Next.js Web Development',
    slug: 'nextjs-web-development',
    categorySlug: 'web-development',
    shortDescription:
      'Master modern full-stack web development with the Next.js App Router, Server Components, and SSR.',
    description:
      'Master modern web development with Next.js. This course covers server-side rendering, static site generation, server actions, route handlers, and full-stack architecture. With real projects, you’ll build scalable, SEO-friendly applications and deploy them with ease.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'INTERMEDIATE',
    language: 'English',
    durationMinutes: 1680,
    publishedAt: '2026-03-15T00:00:00.000Z',
    modules: [
      {
        title: 'Next.js App Router & Server Components',
        description:
          'Understand React Server Components (RSC), nested layouts, and streaming with Suspense.',
        position: 1,
        lessons: [
          {
            title: 'App Router Architecture & Server Rendering',
            description:
              'File-system based routing, layout nesting, and Server Components vs Client Components.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 720,
            isPreview: true,
          },
          {
            title: 'Data Fetching, Caching & Revalidation',
            description:
              'Fetch requests with automatic memoization, time-based ISR, and on-demand tag revalidation.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 480,
            isPreview: false,
            content:
              'Mastering Next.js data cache layers: Request memoization, Data Cache, Full Route Cache, and Router Cache.',
          },
        ],
      },
      {
        title: 'Server Actions, Route Handlers & Production',
        description:
          'Mutate data with Server Actions, handle Webhooks, and deploy to Vercel/Node runtimes.',
        position: 2,
        lessons: [
          {
            title: 'Server Actions & Form Validation',
            description:
              'Mutating database state directly from components using Server Actions and Zod validation.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 880,
            isPreview: false,
          },
          {
            title: 'Route Handlers, Middleware & Deployment',
            description:
              'Configuring edge middleware, security headers, and automated CI/CD deployment.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 550,
            isPreview: false,
            content:
              'Production checklist: Content Security Policy, metadata generation for SEO, and Core Web Vitals optimization.',
          },
        ],
      },
    ],
  },
  {
    title: 'Modern Web Design',
    slug: 'modern-web-design',
    categorySlug: 'web-design',
    shortDescription:
      'Learn the art and science of modern web design: layout principles, typography, Figma, and responsive UI.',
    description:
      'Learn the art and science of modern web design. This course teaches layout principles, typography, color theory, and responsive design. You’ll practice creating visually appealing, user-friendly, and mobile-first websites with real-world projects.',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    price: '1000.00',
    currency: 'BDT',
    level: 'BEGINNER',
    language: 'English',
    durationMinutes: 1440,
    publishedAt: '2026-03-20T00:00:00.000Z',
    modules: [
      {
        title: 'Visual Design Principles & Design Systems',
        description:
          'Master grid systems, typographic hierarchy, color contrast ratios, and design tokens.',
        position: 1,
        lessons: [
          {
            title: 'Layout Grids & Spatial Composition',
            description:
              '8pt spatial grid systems, visual weight balance, and responsive breakpoints.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 600,
            isPreview: true,
          },
          {
            title: 'Typography & Accessible Color Palettes',
            description:
              'Selecting font pairings, WCAG 2.1 AA/AAA contrast guidelines, and dark mode tokens.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 440,
            isPreview: false,
            content:
              'Color contrast guidelines: minimum 4.5:1 ratio for normal text and 3:1 for large text per WCAG AA.',
          },
        ],
      },
      {
        title: 'Figma Prototyping & Developer Handoff',
        description:
          'Construct interactive component libraries with Auto Layout and component variants.',
        position: 2,
        lessons: [
          {
            title: 'Auto Layout & Interactive Components',
            description:
              'Building responsive buttons, navigation bars, and modal dialogs with smart animate.',
            lessonType: 'VIDEO',
            position: 1,
            durationSeconds: 840,
            isPreview: false,
          },
          {
            title: 'Design Specs & Developer Handoff Checklist',
            description:
              'Documenting design token variables, responsive behaviors, and micro-interaction states.',
            lessonType: 'TEXT',
            position: 2,
            durationSeconds: 500,
            isPreview: false,
            content:
              'Developer handoff checklist: naming conventions, exportable SVG assets, responsive constraints, and accessibility annotations.',
          },
        ],
      },
    ],
  },
];
