// index.ts
function regex_tokenize(expr, rules) {
  const tokens = [];
  let cursor = 0;
  let prev_slice = "";
  while (cursor < expr.length) {
    const slice = expr.slice(cursor);
    if (slice === prev_slice) {
      throw new SyntaxError(`Unable to tokenize at ${cursor + 1} --> ${slice}`);
    }
    prev_slice = slice;
    for (const [tokenType, regexpr] of rules) {
      const matched = regexpr.exec(slice);
      if (matched === null)
        continue;
      cursor += matched[0].length;
      if (tokenType === "null")
        break;
      tokens.push({ type: tokenType, value: matched[0] });
      break;
    }
  }
  return tokens;
}

class DiceRoller {
  TokensRULES = [
    ["DiceExpr", /^(?:[1-9]\d*)?d[1-9]\d*(?:k[lh]?[1-9]\d*|e[lh]?[1-9]\d*|r[lh]?[1-9]\d*)*/],
    ["Operator", /^[+-/*]/],
    ["NumericLiteral", /^\d+/],
    ["Delimiter", /^[\(\)]/],
    ["null", /^\s+/]
  ];
  DicePartsRULES = [
    ["Dice", /^(?:[1-9]\d*)?d[1-9]\d*/],
    ["Explode", /^e[lh]?[1-9]\d*/],
    ["Keep", /^k[lh]?[1-9]\d*/],
    ["Reroll", /^r[lh]?[1-9]\d*/]
  ];
  tokenize(expr) {
    const tokens = regex_tokenize(expr, this.TokensRULES).map((v) => {
      if (v.type === "DiceExpr")
        return {
          type: v.type,
          value: regex_tokenize(v.value, this.DicePartsRULES)
        };
      return v;
    });
    return tokens;
  }
  Roll(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }
  Delimiter(token) {
    return {
      type: token.type,
      value: token.value
    };
  }
  NumericLiteral(token) {
    return {
      type: token.type,
      value: Number(token.value)
    };
  }
  Operator(token) {
    return {
      type: token.type,
      operator: token.value,
      precedence: token.value === "+" || token.value === "-" ? 1 : 2
    };
  }
  DiceExpr(token) {
    let result = {
      type: token.type,
      dice_amount: 0,
      dice_size: 0,
      rolls: new Array,
      discarded_rolls: []
    };
    for (const ptoken of token.value) {
      switch (ptoken.type) {
        case "Dice": {
          const dice_parts = ptoken.value.split("d");
          result.dice_amount = dice_parts[0] === "" ? 1 : Number(dice_parts[0]);
          result.dice_size = Number(dice_parts[1]);
          result.rolls = Array.from({ length: result.dice_amount }, () => {
            return {
              type: "Dice",
              value: this.Roll(result.dice_size),
              explosions: [],
              reroll_times: 0
            };
          });
          break;
        }
        case "Explode": {
          let explode_type = "h";
          let explode_value = 1;
          const matched = /^e[1-9]\d*/.exec(ptoken.value);
          if (matched !== null) {
            explode_type = "h";
            explode_value = Number(ptoken.value.slice(1));
          } else {
            explode_type = ptoken.value.slice(1, 2);
            explode_value = Number(ptoken.value.slice(2));
          }
          if (explode_type === "h" && explode_value <= 1)
            throw new Error(`Infinite explode recursion on ${ptoken.value}`);
          else if (explode_type === "l" && explode_value >= result.dice_size)
            throw new Error(`Infinite explode recursion on ${ptoken.value}`);
          const validToExplode = (variable) => explode_type === "h" ? variable >= explode_value : variable <= explode_value;
          let new_roll;
          for (const roll of result.rolls) {
            if (validToExplode(roll.value)) {
              roll.explosions.push(roll.value);
              while (true) {
                new_roll = this.Roll(result.dice_size);
                roll.explosions.push(new_roll);
                if (!validToExplode(new_roll))
                  break;
              }
              roll.value = roll.explosions.reduce((a, c) => a + c, 0);
            }
          }
          break;
        }
        case "Keep": {
          let keep_type = "h";
          let keep_value = 1;
          const matched = /^k[1-9]\d*/.exec(ptoken.value);
          if (matched !== null) {
            keep_type = "h";
            keep_value = Number(ptoken.value.slice(1));
          } else {
            keep_type = ptoken.value.slice(1, 2);
            keep_value = Number(ptoken.value.slice(2));
          }
          if (keep_value < 1)
            throw new Error(`you can't keep less than 1 -> ${ptoken.value}`);
          else if (keep_value > result.dice_amount - (result.dice_amount - result.rolls.length))
            throw new Error(`you can't keep more Dice than you have -> ${ptoken.value}`);
          switch (keep_type) {
            case "l": {
              result.rolls.sort((a, b) => a.value - b.value);
              break;
            }
            case "h": {
              result.rolls.sort((a, b) => b.value - a.value);
              break;
            }
          }
          result.discarded_rolls.push(result.rolls.splice(keep_value));
          break;
        }
        case "Reroll": {
          let reroll_type = "l";
          let reroll_value = 1;
          const matched = /^r[1-9]\d*/.exec(ptoken.value);
          if (matched !== null) {
            reroll_type = "l";
            reroll_value = Number(ptoken.value.slice(1));
          } else {
            reroll_type = ptoken.value.slice(1, 2);
            reroll_value = Number(ptoken.value.slice(2));
          }
          if (reroll_type === "h" && reroll_value <= 1)
            throw new Error(`Infinite reroll recursion on ${ptoken.value}`);
          else if (reroll_type === "l" && reroll_value >= result.dice_size)
            throw new Error(`Infinite reroll recursion on ${ptoken.value}`);
          const validToReroll = (variable) => reroll_type === "h" ? variable >= reroll_value : variable <= reroll_value;
          for (const roll of result.rolls) {
            while (validToReroll(roll.value)) {
              roll.reroll_times++;
              roll.value = this.Roll(result.dice_size);
            }
          }
          break;
        }
      }
    }
    return result;
  }
  Parse(tokens) {
    const parsed_tokens = [];
    for (const token of tokens) {
      switch (token.type) {
        case "NumericLiteral": {
          parsed_tokens.push(this.NumericLiteral(token));
          break;
        }
        case "Operator": {
          parsed_tokens.push(this.Operator(token));
          break;
        }
        case "DiceExpr": {
          parsed_tokens.push(this.DiceExpr(token));
          break;
        }
        case "null": {
          throw new Error(`there shouldn't be a '${token.value}' of this type`);
        }
        case "Delimiter": {
          parsed_tokens.push(this.Delimiter(token));
        }
      }
    }
    return parsed_tokens;
  }
  ShuntingYardAlgorithm(parsed_tokens) {
    let ReversePolishNotation = [];
    let OperatorStack = [];
    let operatorLevel = 0;
    OperatorStack[operatorLevel] = [];
    for (const token of parsed_tokens) {
      switch (token.type) {
        case "NumericLiteral": {
          ReversePolishNotation.push(token.value);
          break;
        }
        case "DiceExpr": {
          ReversePolishNotation.push(token.rolls.reduce((a, c) => a + c.value, 0));
          break;
        }
        case "Operator": {
          if (OperatorStack[operatorLevel]?.length === 0) {
            OperatorStack[operatorLevel]?.push(token);
          } else {
            const operator = OperatorStack[operatorLevel]?.at(-1);
            if (token.precedence >= operator.precedence) {
              OperatorStack[operatorLevel]?.push(token);
            } else {
              let arr2 = OperatorStack[operatorLevel]?.reverse();
              ReversePolishNotation = ReversePolishNotation.concat(arr2);
              OperatorStack[operatorLevel] = [];
              OperatorStack[operatorLevel]?.push(token);
            }
          }
          break;
        }
        case "Delimiter":
          switch (token.value) {
            case "(": {
              operatorLevel++;
              if (!OperatorStack[operatorLevel]) {
                OperatorStack[operatorLevel] = [];
              }
              break;
            }
            case ")": {
              let arr2 = OperatorStack[operatorLevel]?.reverse();
              ReversePolishNotation = ReversePolishNotation.concat(arr2);
              OperatorStack[operatorLevel] = [];
              operatorLevel--;
              break;
            }
          }
      }
    }
    let arr = OperatorStack[operatorLevel]?.reverse();
    ReversePolishNotation = ReversePolishNotation.concat(arr);
    return ReversePolishNotation.map((v) => typeof v === "number" ? v : v.operator);
  }
  ComputeReversePolishNotation(rpn) {
    const results = [];
    for (const val of rpn) {
      if (typeof val === "number") {
        results.push(val);
      } else {
        let a = results.pop();
        let b = results.pop();
        switch (val) {
          case "+":
            results.push(b + a);
            break;
          case "-":
            results.push(b - a);
            break;
          case "*":
            results.push(b * a);
            break;
          case "/":
            results.push(b / a);
            break;
        }
      }
    }
    if (!results[0])
      throw new Error(`this shouldn't happen at all ${results}`);
    return results[0];
  }
  roll(tokens) {
    const rolled = this.Parse(tokens);
    const reverse_polish_notation = this.ShuntingYardAlgorithm(rolled);
    const result = this.ComputeReversePolishNotation(reverse_polish_notation);
    return [rolled, result];
  }
}
export {
  DiceRoller
};
