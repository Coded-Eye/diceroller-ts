# diceroller-ts

### Features
It can handle these types of expressions easily
```javascript
const diceRoller = new DiceRoller()

// spaces between tokens are ignored.
// for stylistic reasons it is not the same for DiceExpr.
// if this is requested enough I could add it in the future.
const tokens = diceRoller.tokenize('((100d500eh400kl10rl100 + (10-30) )/ (4 * 2))')
const [parsed, result] = diceRoller.roll(tokens)

// parsed is an array of every token in tokens but the diceExprs are handled, you can use it to display the expression result.
console.dir(parsed, { depth: null })

// result is just a the resulting value of the mathematical expression.
console.log(result)
```

the diceExpr can be modified by using modifiers
such as Explode, Keep, Reroll

```javascript
const value1 = "10d10e10"
const value2 = "10d10k3"
const value3 = "10d10r1"

// you can further control the modifiers by defining if you mean higher or lower
const value4 = "10d10eh9" // explode any dice higher than 9 (this is default, e9 === eh9)
const value5 = "10d10el4" // explode any dice lower than 4

const value6 = "10d10kh5" // keep the 5 higest dice (thisis default k5 === kh5)
const value7 = "10d10kl3" // keep the 3 lowest dice

const value8 = "10d10rh5" // re-roll any dice higher than 5
const value9 = "10d10rl5" // re-roll any dice lower than 5 (this is default r5 === el5)

// also. all these modifiers are chainable
const expr = "10d100rl50e50e400kh5kh3" 
```

and that is it.

if anyone needs something to be added, just make a feature request in the github repo (https://github.com/Coded-Eye/diceroller-ts) and I will look at it.

This project was created using `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
