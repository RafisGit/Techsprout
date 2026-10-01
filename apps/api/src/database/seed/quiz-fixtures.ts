export interface SeedQuizOption {
  text: string;
  isCorrect: boolean;
  position: number;
}

export interface SeedQuizQuestion {
  questionText: string;
  questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  position: number;
  points: number;
  explanation: string;
  options: SeedQuizOption[];
}

export interface SeedQuiz {
  title: string;
  description: string;
  quizType: 'KNOWLEDGE_CHECK' | 'FINAL_EXAM';
  passingScorePercentage: number;
  maxAttempts: number | null;
  timeLimitMinutes: number | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  questions: SeedQuizQuestion[];
}

export const SEED_KNOWLEDGE_CHECK_QUIZ: SeedQuiz = {
  title: 'Module 1 Knowledge Check: Foundations',
  description: 'Test your baseline understanding of core concepts introduced in Module 1.',
  quizType: 'KNOWLEDGE_CHECK',
  passingScorePercentage: 70,
  maxAttempts: 3,
  timeLimitMinutes: 15,
  status: 'PUBLISHED',
  questions: [
    {
      questionText: "Which statement best describes TypeScript's relationship with JavaScript?",
      questionType: 'SINGLE_CHOICE',
      position: 1,
      points: 1,
      explanation: 'TypeScript is a typed superset of JavaScript that compiles to clean, standard JavaScript.',
      options: [
        {
          text: 'TypeScript is a completely separate runtime that does not support JavaScript syntax',
          isCorrect: false,
          position: 1,
        },
        {
          text: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript',
          isCorrect: true,
          position: 2,
        },
        {
          text: 'TypeScript replaces JavaScript natively in modern browser engines',
          isCorrect: false,
          position: 3,
        },
      ],
    },
    {
      questionText: 'Which of the following are valid primitive data types in TypeScript? (Select all that apply)',
      questionType: 'MULTIPLE_CHOICE',
      position: 2,
      points: 2,
      explanation: 'string, number, and boolean are primitive types. Interface is a compile-time type contract.',
      options: [
        { text: 'string', isCorrect: true, position: 1 },
        { text: 'number', isCorrect: true, position: 2 },
        { text: 'boolean', isCorrect: true, position: 3 },
        { text: 'interface', isCorrect: false, position: 4 },
      ],
    },
    {
      questionText: 'TypeScript type annotations exist at runtime and directly impact execution speed.',
      questionType: 'TRUE_FALSE',
      position: 3,
      points: 1,
      explanation: 'TypeScript types are completely erased during compilation and do not exist at JavaScript runtime.',
      options: [
        { text: 'True', isCorrect: false, position: 1 },
        { text: 'False', isCorrect: true, position: 2 },
      ],
    },
  ],
};

export const SEED_FINAL_EXAM_QUIZ: SeedQuiz = {
  title: 'Comprehensive Course Final Examination',
  description: 'Comprehensive certification examination covering all curriculum modules. Passing this assessment qualifies the student for official course certification.',
  quizType: 'FINAL_EXAM',
  passingScorePercentage: 75,
  maxAttempts: 2,
  timeLimitMinutes: 45,
  status: 'PUBLISHED',
  questions: [
    {
      questionText: 'What is the primary architectural benefit of Dependency Injection in backend frameworks?',
      questionType: 'SINGLE_CHOICE',
      position: 1,
      points: 2,
      explanation: 'Dependency Injection decouples class implementations by inverting control of dependency creation, facilitating modularity and unit testability.',
      options: [
        {
          text: 'To accelerate raw HTTP socket streaming performance',
          isCorrect: false,
          position: 1,
        },
        {
          text: 'To decouple components and enhance testability through inversion of control',
          isCorrect: true,
          position: 2,
        },
        {
          text: 'To compile TypeScript directly into web assembly bytecode',
          isCorrect: false,
          position: 3,
        },
      ],
    },
    {
      questionText: 'Which HTTP status codes indicate a successful request completion? (Select all that apply)',
      questionType: 'MULTIPLE_CHOICE',
      position: 2,
      points: 2,
      explanation: '200 OK and 201 Created belong to the 2xx success class. 400 is a client error and 500 is a server error.',
      options: [
        { text: '200 OK', isCorrect: true, position: 1 },
        { text: '201 Created', isCorrect: true, position: 2 },
        { text: '400 Bad Request', isCorrect: false, position: 3 },
        { text: '500 Internal Server Error', isCorrect: false, position: 4 },
      ],
    },
    {
      questionText: 'Relational database transactions guarantee ACID properties to ensure consistent multi-step mutations.',
      questionType: 'TRUE_FALSE',
      position: 3,
      points: 1,
      explanation: 'ACID (Atomicity, Consistency, Isolation, Durability) guarantees ensure reliable database transaction semantics.',
      options: [
        { text: 'True', isCorrect: true, position: 1 },
        { text: 'False', isCorrect: false, position: 2 },
      ],
    },
  ],
};
