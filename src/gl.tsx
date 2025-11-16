import { useEffect, useRef, RefObject } from 'react'

// Default vertex shader - simple fullscreen quad
const DEFAULT_VERTEX_SHADER = `\
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`devjar:gl Shader compilation error: ${error}`)
  }
  
  return shader
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null
  
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`devjar:gl Program linking error: ${error}`)
  }
  
  return program
}

function createQuad(gl: WebGLRenderingContext): WebGLBuffer | null {
  const buffer = gl.createBuffer()
  if (!buffer) return null
  
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  // Fullscreen quad: two triangles covering the entire screen
  const positions = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ])
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
  return buffer
}

export interface UseGlslRendererOptions {
  fragment: string
  canvasRef: RefObject<HTMLCanvasElement>
  onError?: (error: string | null) => void
}

export function useGL({
  fragment,
  canvasRef,
  onError,
}: UseGlslRendererOptions) {
  const animationFrameRef = useRef<number | undefined>(undefined)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const positionBufferRef = useRef<WebGLBuffer | null>(null)
  const startTimeRef = useRef<number>(performance.now())
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl')
    if (!gl) {
      onError?.('devjar:gl WebGL is not supported in your browser')
      return
    }

    glRef.current = gl

    // Create quad buffer once
    const positionBuffer = createQuad(gl)
    if (positionBuffer) {
      positionBufferRef.current = positionBuffer
    }

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const width = rect.width
      const height = rect.height
      
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    
    // Use ResizeObserver for more accurate sizing
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
    })
    resizeObserver.observe(canvas)

    // Handle mouse movement
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1.0 - (e.clientY - rect.top) / rect.height, // Flip Y coordinate
      }
    }

    canvas.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      canvas.removeEventListener('mousemove', handleMouseMove)
      resizeObserver.disconnect()
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (positionBufferRef.current && gl) {
        gl.deleteBuffer(positionBufferRef.current)
      }
    }
  }, [canvasRef, onError])

  // Compile and render shader
  useEffect(() => {
    const gl = glRef.current
    const canvas = canvasRef.current
    if (!gl || !canvas) return

    onError?.(null)

    try {
      // Create shaders
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, DEFAULT_VERTEX_SHADER)
      if (!vertexShader) throw new Error('devjar:gl Failed to create vertex shader')

      const compiledFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragment)
      if (!compiledFragmentShader) throw new Error('devjar:gl Failed to create fragment shader')

      // Create program
      const program = createProgram(gl, vertexShader, compiledFragmentShader)
      if (!program) throw new Error('devjar:gl Failed to create program')

      // Clean up old program
      if (programRef.current) {
        gl.deleteProgram(programRef.current)
      }

      programRef.current = program

      // Clean up shaders (they're linked into the program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(compiledFragmentShader)

      // Render loop
      const render = () => {
        if (!gl || !canvas || !programRef.current || !positionBufferRef.current) return

        const program = programRef.current
        const positionBuffer = positionBufferRef.current

        // Clear
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)

        // Use program
        gl.useProgram(program)

        // Set up position attribute
        const positionLocation = gl.getAttribLocation(program, 'a_position')
        if (positionLocation >= 0) {
          gl.enableVertexAttribArray(positionLocation)
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
        }

        // Set uniforms
        const time = (performance.now() - startTimeRef.current) / 1000
        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
        const timeLocation = gl.getUniformLocation(program, 'u_time')
        const mouseLocation = gl.getUniformLocation(program, 'u_mouse')

        if (resolutionLocation) {
          gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
        }
        if (timeLocation) {
          gl.uniform1f(timeLocation, time)
        }
        if (mouseLocation) {
          gl.uniform2f(mouseLocation, mouseRef.current.x, mouseRef.current.y)
        }

        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6)

        animationFrameRef.current = requestAnimationFrame(render)
      }

      // Start render loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      render()

      // Cleanup function
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        if (programRef.current && gl) {
          gl.deleteProgram(programRef.current)
          programRef.current = null
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const prefixedMessage = errorMessage.startsWith('devjar:gl ') 
        ? errorMessage 
        : `devjar:gl ${errorMessage}`
      onError?.(prefixedMessage)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [fragment, canvasRef, onError])
}

