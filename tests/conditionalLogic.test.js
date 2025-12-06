const {
  shouldShowQuestion,
  getVisibleQuestions,
  validateConditionalRules
} = require('../utils/conditionalLogic');

describe('Conditional Logic - shouldShowQuestion', () => {
  describe('No rules (always show)', () => {
    it('should return true when rules is null', () => {
      expect(shouldShowQuestion(null, {})).toBe(true);
    });

    it('should return true when rules is undefined', () => {
      expect(shouldShowQuestion(undefined, {})).toBe(true);
    });

    it('should return true when conditions array is empty', () => {
      expect(shouldShowQuestion({ logic: 'AND', conditions: [] }, {})).toBe(true);
    });
  });

  describe('Equals operator', () => {
    const rules = {
      logic: 'AND',
      conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
    };

    it('should return true when value matches', () => {
      expect(shouldShowQuestion(rules, { role: 'Engineer' })).toBe(true);
    });

    it('should return false when value does not match', () => {
      expect(shouldShowQuestion(rules, { role: 'Designer' })).toBe(false);
    });

    it('should return false when answer is missing', () => {
      expect(shouldShowQuestion(rules, {})).toBe(false);
    });

    it('should work with arrays (multi-select)', () => {
      const rulesArray = {
        logic: 'AND',
        conditions: [{ questionKey: 'skills', operator: 'equals', value: 'JavaScript' }]
      };
      
      expect(shouldShowQuestion(rulesArray, { skills: ['JavaScript', 'Python'] })).toBe(true);
      expect(shouldShowQuestion(rulesArray, { skills: ['Python', 'Ruby'] })).toBe(false);
    });
  });

  describe('NotEquals operator', () => {
    const rules = {
      logic: 'AND',
      conditions: [{ questionKey: 'role', operator: 'notEquals', value: 'Engineer' }]
    };

    it('should return true when value does not match', () => {
      expect(shouldShowQuestion(rules, { role: 'Designer' })).toBe(true);
    });

    it('should return false when value matches', () => {
      expect(shouldShowQuestion(rules, { role: 'Engineer' })).toBe(false);
    });

    it('should return true when answer is missing', () => {
      expect(shouldShowQuestion(rules, {})).toBe(true);
    });

    it('should work with arrays (multi-select)', () => {
      const rulesArray = {
        logic: 'AND',
        conditions: [{ questionKey: 'skills', operator: 'notEquals', value: 'JavaScript' }]
      };
      
      expect(shouldShowQuestion(rulesArray, { skills: ['JavaScript', 'Python'] })).toBe(false);
      expect(shouldShowQuestion(rulesArray, { skills: ['Python', 'Ruby'] })).toBe(true);
    });
  });

  describe('Contains operator', () => {
    const rules = {
      logic: 'AND',
      conditions: [{ questionKey: 'description', operator: 'contains', value: 'github' }]
    };

    it('should return true when string contains value (case insensitive)', () => {
      expect(shouldShowQuestion(rules, { description: 'My GitHub profile' })).toBe(true);
      expect(shouldShowQuestion(rules, { description: 'Check my github' })).toBe(true);
      expect(shouldShowQuestion(rules, { description: 'GITHUB.COM' })).toBe(true);
    });

    it('should return false when string does not contain value', () => {
      expect(shouldShowQuestion(rules, { description: 'My portfolio' })).toBe(false);
    });

    it('should return false when answer is missing', () => {
      expect(shouldShowQuestion(rules, {})).toBe(false);
    });

    it('should work with arrays', () => {
      const rulesArray = {
        logic: 'AND',
        conditions: [{ questionKey: 'tags', operator: 'contains', value: 'dev' }]
      };
      
      expect(shouldShowQuestion(rulesArray, { tags: ['developer', 'designer'] })).toBe(true);
      expect(shouldShowQuestion(rulesArray, { tags: ['DevOps', 'Backend'] })).toBe(true);
      expect(shouldShowQuestion(rulesArray, { tags: ['product', 'manager'] })).toBe(false);
    });
  });

  describe('AND logic', () => {
    const rules = {
      logic: 'AND',
      conditions: [
        { questionKey: 'role', operator: 'equals', value: 'Engineer' },
        { questionKey: 'experience', operator: 'equals', value: 'Senior' }
      ]
    };

    it('should return true when all conditions are true', () => {
      expect(shouldShowQuestion(rules, {
        role: 'Engineer',
        experience: 'Senior'
      })).toBe(true);
    });

    it('should return false when any condition is false', () => {
      expect(shouldShowQuestion(rules, {
        role: 'Engineer',
        experience: 'Junior'
      })).toBe(false);

      expect(shouldShowQuestion(rules, {
        role: 'Designer',
        experience: 'Senior'
      })).toBe(false);
    });

    it('should return false when all conditions are false', () => {
      expect(shouldShowQuestion(rules, {
        role: 'Designer',
        experience: 'Junior'
      })).toBe(false);
    });
  });

  describe('OR logic', () => {
    const rules = {
      logic: 'OR',
      conditions: [
        { questionKey: 'role', operator: 'equals', value: 'Engineer' },
        { questionKey: 'role', operator: 'equals', value: 'Designer' }
      ]
    };

    it('should return true when any condition is true', () => {
      expect(shouldShowQuestion(rules, { role: 'Engineer' })).toBe(true);
      expect(shouldShowQuestion(rules, { role: 'Designer' })).toBe(true);
    });

    it('should return false when all conditions are false', () => {
      expect(shouldShowQuestion(rules, { role: 'Manager' })).toBe(false);
    });

    it('should return true when all conditions are true', () => {
      const rulesMulti = {
        logic: 'OR',
        conditions: [
          { questionKey: 'hasGithub', operator: 'equals', value: 'yes' },
          { questionKey: 'hasLinkedIn', operator: 'equals', value: 'yes' }
        ]
      };

      expect(shouldShowQuestion(rulesMulti, {
        hasGithub: 'yes',
        hasLinkedIn: 'yes'
      })).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle null answers', () => {
      const rules = {
        logic: 'AND',
        conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
      };
      
      expect(shouldShowQuestion(rules, { role: null })).toBe(false);
    });

    it('should handle empty string answers', () => {
      const rules = {
        logic: 'AND',
        conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
      };
      
      expect(shouldShowQuestion(rules, { role: '' })).toBe(false);
    });

    it('should handle numeric values', () => {
      const rules = {
        logic: 'AND',
        conditions: [{ questionKey: 'age', operator: 'equals', value: 25 }]
      };
      
      expect(shouldShowQuestion(rules, { age: 25 })).toBe(true);
      expect(shouldShowQuestion(rules, { age: 30 })).toBe(false);
    });

    it('should handle boolean values', () => {
      const rules = {
        logic: 'AND',
        conditions: [{ questionKey: 'agree', operator: 'equals', value: true }]
      };
      
      expect(shouldShowQuestion(rules, { agree: true })).toBe(true);
      expect(shouldShowQuestion(rules, { agree: false })).toBe(false);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle example from spec: Show githubUrl only if role = Engineer', () => {
      const rules = {
        logic: 'AND',
        conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
      };

      expect(shouldShowQuestion(rules, { role: 'Engineer' })).toBe(true);
      expect(shouldShowQuestion(rules, { role: 'Designer' })).toBe(false);
      expect(shouldShowQuestion(rules, { role: 'Manager' })).toBe(false);
      expect(shouldShowQuestion(rules, {})).toBe(false);
    });

    it('should handle multiple conditions with AND', () => {
      const rules = {
        logic: 'AND',
        conditions: [
          { questionKey: 'role', operator: 'equals', value: 'Engineer' },
          { questionKey: 'skills', operator: 'contains', value: 'JavaScript' },
          { questionKey: 'experience', operator: 'notEquals', value: 'Intern' }
        ]
      };

      expect(shouldShowQuestion(rules, {
        role: 'Engineer',
        skills: 'JavaScript, React, Node.js',
        experience: 'Senior'
      })).toBe(true);

      expect(shouldShowQuestion(rules, {
        role: 'Engineer',
        skills: 'Python, Django',
        experience: 'Senior'
      })).toBe(false);
    });

    it('should handle multiple conditions with OR', () => {
      const rules = {
        logic: 'OR',
        conditions: [
          { questionKey: 'country', operator: 'equals', value: 'USA' },
          { questionKey: 'country', operator: 'equals', value: 'Canada' },
          { questionKey: 'country', operator: 'equals', value: 'UK' }
        ]
      };

      expect(shouldShowQuestion(rules, { country: 'USA' })).toBe(true);
      expect(shouldShowQuestion(rules, { country: 'Canada' })).toBe(true);
      expect(shouldShowQuestion(rules, { country: 'Germany' })).toBe(false);
    });
  });
});

describe('getVisibleQuestions', () => {
  const questions = [
    { questionKey: 'name', conditionalRules: null },
    { 
      questionKey: 'githubUrl', 
      conditionalRules: {
        logic: 'AND',
        conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
      }
    },
    { questionKey: 'role', conditionalRules: null }
  ];

  it('should return all visible question keys', () => {
    const visible = getVisibleQuestions(questions, { role: 'Engineer' });
    expect(visible).toEqual(['name', 'githubUrl', 'role']);
  });

  it('should exclude conditionally hidden questions', () => {
    const visible = getVisibleQuestions(questions, { role: 'Designer' });
    expect(visible).toEqual(['name', 'role']);
  });
});

describe('validateConditionalRules', () => {
  it('should validate rules with no errors', () => {
    const questions = [
      { questionKey: 'role', conditionalRules: null },
      { 
        questionKey: 'githubUrl',
        conditionalRules: {
          logic: 'AND',
          conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
        }
      }
    ];

    const result = validateConditionalRules(questions);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect non-existent question reference', () => {
    const questions = [
      { 
        questionKey: 'githubUrl',
        conditionalRules: {
          logic: 'AND',
          conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
        }
      }
    ];

    const result = validateConditionalRules(questions);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toContain('does not exist');
  });

  it('should detect circular dependency', () => {
    const questions = [
      { 
        questionKey: 'role',
        conditionalRules: {
          logic: 'AND',
          conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
        }
      }
    ];

    const result = validateConditionalRules(questions);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].error).toContain('cannot have conditional rule referencing itself');
  });

  it('should detect invalid operator', () => {
    const questions = [
      { questionKey: 'role', conditionalRules: null },
      { 
        questionKey: 'githubUrl',
        conditionalRules: {
          logic: 'AND',
          conditions: [{ questionKey: 'role', operator: 'invalidOp', value: 'Engineer' }]
        }
      }
    ];

    const result = validateConditionalRules(questions);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].error).toContain('Invalid operator');
  });

  it('should detect invalid logic operator', () => {
    const questions = [
      { questionKey: 'role', conditionalRules: null },
      { 
        questionKey: 'githubUrl',
        conditionalRules: {
          logic: 'XOR',
          conditions: [{ questionKey: 'role', operator: 'equals', value: 'Engineer' }]
        }
      }
    ];

    const result = validateConditionalRules(questions);
    expect(result.isValid).toBe(false);
    expect(result.errors[0].error).toContain('Invalid logic operator');
  });
});
