export interface OptionValidationInput {
  optionText: string;
  position: number;
  isCorrect: boolean;
}

export interface QuestionValidationInput {
  id?: string;
  questionText: string;
  questionType: string;
  position: number;
  points: number;
  explanation?: string | null;
  options: OptionValidationInput[];
}

export function validateQuestionOptions(
  questionType: string,
  options: OptionValidationInput[]
): { isValid: boolean; error?: string } {
  if (!['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(questionType)) {
    return {
      isValid: false,
      error: `Unsupported question type: "${questionType}". Supported types are SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE.`,
    };
  }

  // Validate positions within question
  const positionSet = new Set<number>();
  for (const opt of options) {
    if (!Number.isInteger(opt.position) || opt.position <= 0) {
      return {
        isValid: false,
        error: `Option position must be a positive integer, received: ${opt.position}`,
      };
    }
    if (positionSet.has(opt.position)) {
      return {
        isValid: false,
        error: `Duplicate option position ${opt.position} detected`,
      };
    }
    positionSet.add(opt.position);
  }

  const correctCount = options.filter((o) => o.isCorrect).length;

  if (questionType === 'SINGLE_CHOICE') {
    if (options.length < 2) {
      return {
        isValid: false,
        error: 'SINGLE_CHOICE questions must have at least 2 options',
      };
    }
    if (correctCount !== 1) {
      return {
        isValid: false,
        error: `SINGLE_CHOICE questions must have exactly one correct option, found ${correctCount}`,
      };
    }
  } else if (questionType === 'MULTIPLE_CHOICE') {
    if (options.length < 2) {
      return {
        isValid: false,
        error: 'MULTIPLE_CHOICE questions must have at least 2 options',
      };
    }
    if (correctCount < 1) {
      return {
        isValid: false,
        error: 'MULTIPLE_CHOICE questions must have at least one correct option',
      };
    }
  } else if (questionType === 'TRUE_FALSE') {
    if (options.length !== 2) {
      return {
        isValid: false,
        error: `TRUE_FALSE questions must have exactly 2 options ("True" and "False"), found ${options.length}`,
      };
    }
    const lowerTexts = options.map((o) => o.optionText.trim().toLowerCase());
    if (!lowerTexts.includes('true') || !lowerTexts.includes('false')) {
      return {
        isValid: false,
        error: 'TRUE_FALSE questions must have options labeled "True" and "False"',
      };
    }
    if (correctCount !== 1) {
      return {
        isValid: false,
        error: `TRUE_FALSE questions must have exactly one correct option, found ${correctCount}`,
      };
    }
  }

  return { isValid: true };
}

export function validateQuizForPublish(quiz: {
  id: string;
  title: string;
  questions: QuestionValidationInput[];
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!quiz.questions || quiz.questions.length === 0) {
    errors.push('Quiz must contain at least one question to be published');
    return { isValid: false, errors };
  }

  const questionPositionSet = new Set<number>();
  quiz.questions.forEach((q, index) => {
    const qLabel = `Question ${index + 1} ("${q.questionText.slice(0, 30)}...")`;

    if (!Number.isInteger(q.position) || q.position <= 0) {
      errors.push(`${qLabel}: Position must be a positive integer, received ${q.position}`);
    } else if (questionPositionSet.has(q.position)) {
      errors.push(`${qLabel}: Duplicate question position ${q.position} detected`);
    } else {
      questionPositionSet.add(q.position);
    }

    if (!Number.isInteger(q.points) || q.points <= 0) {
      errors.push(`${qLabel}: Points must be a positive integer, received ${q.points}`);
    }

    const optionsValidation = validateQuestionOptions(q.questionType, q.options || []);
    if (!optionsValidation.isValid) {
      errors.push(`${qLabel}: ${optionsValidation.error}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
