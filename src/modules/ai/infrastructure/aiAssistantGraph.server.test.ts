/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { createAiAssistantGraph } from './aiAssistantGraph.server'
import { AiRequestResponseLoggingMiddleware } from './aiRequestResponseMiddleware.server'

describe('AI assistant graph topology', () => {
  it('exposes request and response middleware nodes with explicit edges around analysis', () => {
    const graph = createAiAssistantGraph(
      { analyze: jest.fn() },
      new AiRequestResponseLoggingMiddleware({ success: jest.fn(), error: jest.fn() })
    ).getGraph()

    expect(Object.keys(graph.nodes)).toEqual(expect.arrayContaining([
      '__start__',
      'retrieve',
      'middleware_request',
      'analyze',
      'middleware_response',
      '__end__'
    ]))
    expect(graph.edges.map(({ source, target }) => `${source}->${target}`)).toEqual(expect.arrayContaining([
      '__start__->retrieve',
      'retrieve->middleware_request',
      'middleware_request->analyze',
      'analyze->middleware_response',
      'middleware_response->__end__'
    ]))
  })

  it('rejects an empty Studio input before the retrieve node runs', async () => {
    const analyze = jest.fn()
    const graph = createAiAssistantGraph(
      { analyze },
      new AiRequestResponseLoggingMiddleware({ success: jest.fn(), error: jest.fn() })
    )

    await expect(graph.invoke({} as never)).rejects.toThrow()
    expect(analyze).not.toHaveBeenCalled()
  })
})
