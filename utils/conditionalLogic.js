function shouldShowQuestion(rules, answersSoFar) {
  if (!rules || !rules.conditions || rules.conditions.length === 0) {
    return true;
  }

  const evaluateCondition = (condition) => {
    const { questionKey, operator, value } = condition;
    const answer = answersSoFar[questionKey];

    if (answer === undefined || answer === null || answer === '') {
      return operator === 'notEquals';
    }

    switch (operator) {
      case 'equals':
        if (Array.isArray(answer)) {
          return answer.includes(value);
        }
        return answer === value;

      case 'notEquals':
        if (Array.isArray(answer)) {
          return !answer.includes(value);
        }
        return answer !== value;

      case 'contains':
        if (typeof answer === 'string') {
          return answer.toLowerCase().includes(String(value).toLowerCase());
        }
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

  const results = rules.conditions.map(evaluateCondition);

  if (rules.logic === 'AND') {
    return results.every(result => result === true);
  } else if (rules.logic === 'OR') {
    return results.some(result => result === true);
  } else {
    console.warn(`Unknown logic operator: ${rules.logic}`);
    return true;
  }
}

function getVisibleQuestions(questions, answersSoFar) {
  return questions
    .filter(q => shouldShowQuestion(q.conditionalRules, answersSoFar))
    .map(q => q.questionKey);
}

function validateConditionalRules(questions) {
  const errors = [];
  const questionKeys = new Set(questions.map(q => q.questionKey));

  questions.forEach((question, index) => {
    const rules = question.conditionalRules;
    
    if (!rules || !rules.conditions) return;

    rules.conditions.forEach((condition, condIndex) => {
      if (!questionKeys.has(condition.questionKey)) {
        errors.push({
          questionIndex: index,
          questionKey: question.questionKey,
          conditionIndex: condIndex,
          error: `Referenced question "${condition.questionKey}" does not exist`
        });
      }

      if (condition.questionKey === question.questionKey) {
        errors.push({
          questionIndex: index,
          questionKey: question.questionKey,
          conditionIndex: condIndex,
          error: 'Question cannot have conditional rule referencing itself'
        });
      }

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
