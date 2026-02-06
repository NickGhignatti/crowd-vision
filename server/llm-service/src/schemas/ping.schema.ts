import { Type, Static } from '@sinclair/typebox';

export const PingSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String({ format: 'email' }),
  age: Type.Number({ minimum: 0 })
});



export const CalculateBodySchema = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
  operation: Type.Union([Type.Literal('add'), Type.Literal('multiply')])
})

export type CalculateBody = Static<typeof CalculateBodySchema>
// Extract the TypeScript type
export type Ping = Static<typeof PingSchema>;
