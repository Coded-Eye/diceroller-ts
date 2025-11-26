function regex_tokenize<T extends string>(expr: string, rules: [T, RegExp][]) {
    const tokens: { type: T, value: string }[] = []
    let cursor: number = 0
    let prev_slice: string = ""

    while (cursor < expr.length) {
        const slice = expr.slice(cursor)
        if (slice === prev_slice) { throw new SyntaxError(`Unable to tokenize at ${cursor + 1} --> ${slice}`) }
        prev_slice = slice

        for (const [tokenType, regexpr] of rules) {
            const matched = regexpr.exec(slice)

            if (matched === null) continue
            cursor += matched[0].length

            if (tokenType === "null") break

            tokens.push({ type: tokenType, value: matched[0] })
            break
        }
    }

    return tokens
}

type Tokens = "DiceExpr" | "Operator" | "NumericLiteral" | "null" | "Delimiter"
type OperatorTokenValues = "+" | "-" | "*" | "/"
type DelimiterTokenValues = "(" | ")"
type Rule<T> = [T, RegExp]
type DiceParts = "Dice" | "Explode" | "Reroll" | "Keep"
type ResultTokens = ReturnType<typeof DiceRoller.prototype.tokenize>
interface Dice {
    type: 'Dice', 
    value: number, 
    explosions: number[]
    reroll_times: number
}


class DiceRoller {
    TokensRULES: Rule<Tokens>[] = [
        ["DiceExpr", /^(?:[1-9]\d*)?d[1-9]\d*(?:k[lh]?[1-9]\d*|e[lh]?[1-9]\d*|r[lh]?[1-9]\d*)*/],
        ["Operator", /^[+-/*]/],
        ["NumericLiteral", /^\d+/],
        ["Delimiter", /^[\(\)]/],

        // null is for white space and stuff that will not be tokenized
        ["null", /^\s+/],
    ]

    DicePartsRULES: Rule<DiceParts>[] = [
        ["Dice", /^(?:[1-9]\d*)?d[1-9]\d*/],
        ["Explode", /^e[lh]?[1-9]\d*/],
        ["Keep", /^k[lh]?[1-9]\d*/],
        ["Reroll", /^r[lh]?[1-9]\d*/],
    ]

    tokenize(expr: string) {
        const tokens = regex_tokenize<Tokens>(expr, this.TokensRULES)
            .map((v) => {
                if (v.type === "DiceExpr") return {
                    type: v.type as Extract<Tokens, "DiceExpr">,
                    value: regex_tokenize<DiceParts>(v.value, this.DicePartsRULES)
                }

                return v
            })

        return tokens
    }

    Roll(sides: number) {
        return Math.floor(Math.random() * sides) + 1
    }

    Delimiter(token: Extract<ResultTokens[number], { value: string }>) {
        return {
            type: token.type as Extract<Tokens, "Delimiter">,
            value: token.value as DelimiterTokenValues
        }
    }

    NumericLiteral(token: Extract<ResultTokens[number], {value: string} >): { type: "NumericLiteral", value: number} {
        return { 
            type: token.type as Extract<Tokens, "NumericLiteral">, 
            value: Number(token.value)
        }
    }

    Operator(token: Extract<ResultTokens[number], {value: string} >) {
        return {
            type: token.type as Extract<Tokens, "Operator">,
            operator: token.value as OperatorTokenValues,
            precedence: token.value === "+" || token.value === "-" ? 1 :  2
        }
    }

    DiceExpr(token: Extract<ResultTokens[number], {value: unknown[] } > ) {
        let result = {
            type: token.type as Extract<Tokens, "DiceExpr">,
            dice_amount: 0,
            dice_size: 0,
            rolls: new Array<Dice>(),
            discarded_rolls: [] as Dice[][]
        }

        for (const ptoken of token.value) {
            switch (ptoken.type) {
                case "Dice": {
                    const dice_parts = ptoken.value.split('d')
                    result.dice_amount = dice_parts[0] === "" ? 1 : Number(dice_parts[0])
                    result.dice_size = Number(dice_parts[1])
                    result.rolls = Array.from({ length: result.dice_amount }, () => { return {
                        type: 'Dice', 
                        value: this.Roll(result.dice_size), 
                        explosions: [],
                        reroll_times: 0 
                    }})
                    break
                }
                
                case "Explode": {
                    let explode_type: string = "h"
                    let explode_value: number = 1
                    
                    // parse the string token into usable format
                    const matched = /^e[1-9]\d*/.exec(ptoken.value)
                    if (matched !== null) {
                        explode_type = "h"
                        explode_value = Number(ptoken.value.slice(1))
                    } else {
                        explode_type = ptoken.value.slice(1, 2) as "h" | "l"
                        explode_value = Number(ptoken.value.slice(2))
                    }

                    // check for infinite explode
                    if (explode_type === "h" && (explode_value <= 1 )) 
                        throw new Error(`Infinite explode recursion on ${ptoken.value}`)
                    else if (explode_type === "l" && (explode_value >= result.dice_size))
                        throw new Error(`Infinite explode recursion on ${ptoken.value}`)

                    const validToExplode = (variable: number) => explode_type === "h" ? (variable >= explode_value) : (variable <= explode_value)

                    let new_roll: number
                    for (const roll of result.rolls) {
                        // see if we can ignite the explode process
                        if (validToExplode(roll.value)) {

                            // I could add this to the reduce as reduce((a, c) => a + c, roll.value) but I Won't since I need all the explosions.
                            roll.explosions.push(roll.value)

                            // process ignited. We keep exploding until we can't
                            while (true) {
                                new_roll = this.Roll(result.dice_size)
                                roll.explosions.push(new_roll)

                                if (!validToExplode(new_roll)) break
                            }

                            // we finished exploding, we see the dice result
                            roll.value = roll.explosions.reduce((a, c) => a + c, 0)
                        }
                    }
                    
                    break
                }
            
                case 'Keep': {
                    let keep_type: "h" | "l" = "h"
                    let keep_value: number = 1
                    
                    // parse the string token into usable format
                    const matched = /^k[1-9]\d*/.exec(ptoken.value)
                    if (matched !== null) {
                        keep_type = "h"
                        keep_value = Number(ptoken.value.slice(1))
                    } else {
                        keep_type = ptoken.value.slice(1, 2) as "h" | "l"
                        keep_value = Number(ptoken.value.slice(2))
                    }

                    // check for keep errors
                    if (keep_value < 1) throw new Error(`you can't keep less than 1 -> ${ptoken.value}`);
                    // to find how much was discarded : result.dice_amount - (result.dice_amount - result.rolls.length)
                    else if (keep_value > result.dice_amount - (result.dice_amount - result.rolls.length)) throw new Error(`you can't keep more Dice than you have -> ${ptoken.value}`);

                    
                    // sort the dices then remove either the biggest or lowest X
                    switch (keep_type) {
                        case "l": {
                            result.rolls.sort((a, b) => a.value - b.value)
                            break
                        }

                        case "h": {
                            result.rolls.sort((a, b) => b.value - a.value)
                            break
                        }
                    }
                    result.discarded_rolls.push(result.rolls.splice(keep_value))

                    break
                }

                
                case "Reroll": {
                    let reroll_type: string = "l"
                    let reroll_value: number = 1
                    
                    // parse the string token into usable format
                    const matched = /^r[1-9]\d*/.exec(ptoken.value)
                    if (matched !== null) {
                        reroll_type = "l"
                        reroll_value = Number(ptoken.value.slice(1))
                    } else {
                        reroll_type = ptoken.value.slice(1, 2) as "h" | "l"
                        reroll_value = Number(ptoken.value.slice(2))
                    }

                    // check for infinite rerolls
                    if (reroll_type === "h" && (reroll_value <= 1 )) 
                        throw new Error(`Infinite reroll recursion on ${ptoken.value}`)
                    else if (reroll_type === "l" && (reroll_value >= result.dice_size))
                        throw new Error(`Infinite reroll recursion on ${ptoken.value}`)

                    const validToReroll = (variable: number) => reroll_type === "h" ? (variable >= reroll_value) : (variable <= reroll_value)

                    for (const roll of result.rolls) {
                        while (validToReroll(roll.value)) {
                            roll.reroll_times++;
                            roll.value = this.Roll(result.dice_size)
                        }
                    }
                    break
                }
            }
        }

        return result
    }

    Parse(tokens: ResultTokens) {
        const parsed_tokens = []

        for (const token of tokens) {
            switch (token.type) {
                case "NumericLiteral": {
                    parsed_tokens.push(this.NumericLiteral(token))
                    break;
                }
                
                case "Operator": {
                    parsed_tokens.push(this.Operator(token))
                    break
                }
                
                case "DiceExpr": {
                    parsed_tokens.push(this.DiceExpr(token as Extract<ResultTokens[number], {value: unknown[]}>))
                    break
                }

                case "null": {
                    throw new Error(`there shouldn't be a '${token.value}' of this type`)
                }
                    
                case "Delimiter": {
                    parsed_tokens.push(this.Delimiter(token))
                }
            }
        }

        return parsed_tokens
    }

    ShuntingYardAlgorithm(parsed_tokens: ReturnType<typeof DiceRoller.prototype.Parse >) {
        let ReversePolishNotation: Array<number | ReturnType<typeof DiceRoller.prototype.Operator>> = []
        let OperatorStack: ReturnType<typeof DiceRoller.prototype.Operator>[][] = []
        let operatorLevel: number = 0

        OperatorStack[operatorLevel] = []

        for (const token of parsed_tokens) {
            switch (token.type) {
                case "NumericLiteral": {
                    ReversePolishNotation.push(token.value)
                    break;
                }

                case "DiceExpr": {
                    ReversePolishNotation.push(token.rolls.reduce((a, c) => a + c.value, 0))
                    break;
                }

                case "Operator": {
                    if (OperatorStack[operatorLevel]?.length === 0) {
                        OperatorStack[operatorLevel]?.push(token)
                        
                    } else {
                        const operator = OperatorStack[operatorLevel]?.at(-1) as ReturnType<typeof DiceRoller.prototype.Operator>
                        if (token.precedence >= operator.precedence ) {
                            OperatorStack[operatorLevel]?.push(token)
                        } else {
                            let arr = OperatorStack[operatorLevel]?.reverse() as typeof ReversePolishNotation
                            ReversePolishNotation = ReversePolishNotation.concat(arr)
                            OperatorStack[operatorLevel] = []

                            OperatorStack[operatorLevel]?.push(token)
                        }
                    }

                    break;
                }

                case "Delimiter":
                    switch (token.value) {
                        case "(": {
                            operatorLevel++;
                            if (!OperatorStack[operatorLevel]) {
                                OperatorStack[operatorLevel] = []
                            }
                            break
                        }

                        case ")": {
                            let arr = OperatorStack[operatorLevel]?.reverse() as typeof ReversePolishNotation
                            ReversePolishNotation = ReversePolishNotation.concat(arr)
                            OperatorStack[operatorLevel] = []
                            operatorLevel--;
                            break
                        }
                    }

            }
        }

        let arr = OperatorStack[operatorLevel]?.reverse() as typeof ReversePolishNotation
        ReversePolishNotation = ReversePolishNotation.concat(arr)

        return ReversePolishNotation.map((v) => typeof v === "number" ? v : v.operator)
    }

    ComputeReversePolishNotation(rpn: ReturnType<typeof DiceRoller.prototype.ShuntingYardAlgorithm>): number {
        const results: number[] = []

        for (const val of rpn) {
            if (typeof val === "number") {
                results.push(val)

            } else {
                let a = results.pop() as number
                let b = results.pop() as number

                switch (val) {
                    case "+":
                        results.push(b + a)
                        break
                    case "-":
                        results.push(b - a)
                        break
                    case "*":
                        results.push(b * a)
                        break
                    case "/":
                        results.push(b / a)
                        break
                }
            }
        }

        if (!results[0]) throw new Error(`this shouldn't happen at all ${results}`)
        return results[0]
    }


    roll(tokens: ResultTokens) {
        const rolled = this.Parse(tokens)
        const reverse_polish_notation = this.ShuntingYardAlgorithm(rolled)
        const result = this.ComputeReversePolishNotation(reverse_polish_notation)

        return [rolled, result]
    }
}

export { DiceRoller }