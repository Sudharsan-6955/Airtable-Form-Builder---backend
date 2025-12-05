/**
 * Conditional Logic Engine
 * Pure function to determine if a question should be shown based on conditional rules
 */

/**
 * Evaluate if a question should be shown based on conditional rules
 * @param {Object|null} rules - Conditional rules object with logic and conditions
 * @param {Object} answersSoFar - Object containing current form answers
 * @returns {boolean} - True if question should be shown, false otherwise
 */
function shouldShowQuestion(rules, answersSoFar) {
  // If no rules, always show the question
  if (!rules || !rules.conditions || rules.conditions.length === 0) {
    return true;
  }

  /**
   * Evaluate a single condition
   */
  const evaluateCondition = (condition) => {
    const { questionKey, operator, value } = condition;
    const answer = answersSoFar[questionKey];

    // Handle missing/undefined answers
    if (answer === undefined || answer === null || answer === '') {
      // Only notEquals passes for missing values
      return operator === 'notEquals';
    }

    switch (operator) {
      case 'equals':
        // Handle arrays (multi-select)
        if (Array.isArray(answer)) {
          return answer.includes(value);
        }
        // Direct comparison for primitives
        return answer === value;

      case 'notEquals':
        // Handle arrays (multi-select)
        if (Array.isArray(answer)) {
          return !answer.includes(value);
        }
        // Direct comparison for primitives
        return answer !== value;

      case 'contains':
        // For strings - case insensitive
        if (typeof answer === 'string') {
          return answer.toLowerCase().includes(String(value).toLowerCase());
        }
        // For arrays - check if any item contains the value
        if (Array.isArray(answer)) {
          return answer.some(item => 
            String(item).toLowerCase().includes(String(value).toLowerCase())
          );
        }
        return false;

      default:
        console.warn(`Unknown operator: ${operator}`);
        return false;
    }
  };

  // Evaluate all conditions
  const results = rules.conditions.map(evaluateCondition);

  // Combine results based on logic operator
  if (rules.logic === 'AND') {
    return results.every(result => result === true);
  } else if (rules.logic === 'OR') {
    return results.some(result => result === true);
  } else {
    console.warn(`Unknown logic operator: ${rules.logic}`);
    return true; // Default to showing question
  }
}

/**
 * Get list of visible question keys based on current answers
 * @param {Array} questions - Array of question objects with conditionalRules
 * @param {Object} answersSoFar - Object containing current form answers
 * @returns {Array} - Array of questionKeys that should be visible
 */
function getVisibleQuestions(questions, answersSoFar) {
  return questions
    .filter(q => shouldShowQuestion(q.conditionalRules, answersSoFar))
    .map(q => q.questionKey);
}

/**
 * Validate that conditional rules reference valid questions
 * @param {Array} questions - Array of all questions in form
 * @returns {Object} - { isValid: boolean, errors: Array }
 */
function validateConditionalRules(questions) {
  const errors = [];
  const questionKeys = new Set(questions.map(q => q.questionKey));

  questions.forEach((question, index) => {
    const rules = question.conditionalRules;
    
    if (!rules || !rules.conditions) return;

    rules.conditions.forEach((condition, condIndex) => {
      // Check if referenced question exists
      if (!questionKeys.has(condition.questionKey)) {
        errors.push({
          questionIndex: index,
          questionKey: question.questionKey,
          conditionIndex: condIndex,
          error: `Referenced question "${condition.questionKey}" does not exist`
        });
      }

      // Check for circular dependencies (question depends on itself)
      if (condition.questionKey === question.questionKey) {
        errors.push({
          questionIndex: index,
          questionKey: question.questionKey,
          conditionIndex: condIndex,
          error: 'Question cannot have conditional rule referencing itself'
        });
      }

      // Validate operator
      const validOperators = ['equals', 'notEquals', 'contains'];
      if (!validOperators.includes(condition.operator)) {
        errors.push({
          questionIndex: index,
          questionKey: question.questionKey,
          conditionIndex: condIndex,
          error: `Invalid operator "${condition.operator}"`
        });
      }
    });

    // Validate logic operator
    if (rules.logic && !['AND', 'OR'].includes(rules.logic)) {
      errors.push({
        questionIndex: index,
        questionKey: question.questionKey,
        error: `Invalid logic operator "${rules.logic}"`
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  shouldShowQuestion,
  getVisibleQuestions,
  validateConditionalRules
};
