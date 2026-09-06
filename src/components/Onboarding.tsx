import { useState } from 'react'
import styled from 'styled-components'

const ONBOARDING_COMPLETED_KEY = 'reframe.onboardingCompleted'

const steps = [
  {
    eyebrow: 'Step 1 of 3',
    title: 'Create a project',
    description: 'Projects keep the videos and exports for each piece of work together. Create one from the + button in the sidebar.',
  },
  {
    eyebrow: 'Step 2 of 3',
    title: 'Import and reframe',
    description: 'Add a video to your project, choose its output format, then position the frame around the subject you want to keep in view.',
  },
  {
    eyebrow: 'Step 3 of 3',
    title: 'Create scenes and export',
    description: 'Press S to create a scene and define the part of the source video for your output. You can create multiple scenes from the same video, then add subtitles if needed and export the finished result.',
  },
]

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
`

const Dialog = styled.div`
  width: min(100%, 520px);
  padding: 2rem;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65);
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/assets/noise.svg');
    background-repeat: repeat;
    opacity: 0.4;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
`

const Eyebrow = styled.p`
  margin: 0 0 1rem;
  color: #f97316;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
`

const Title = styled.h1`
  margin: 0 0 0.75rem;
  color: #e5e5e5;
  font-size: 1.5rem;
  font-weight: 600;
`

const Description = styled.p`
  min-height: 4.5rem;
  margin: 0;
  color: #a3a3a3;
  font-size: 0.9375rem;
  line-height: 1.55;
`

const Progress = styled.div`
  display: flex;
  gap: 0.375rem;
  margin: 2rem 0 1.5rem;
`

const ProgressDot = styled.span<{ $active: boolean }>`
  width: ${p => p.$active ? '1.5rem' : '0.5rem'};
  height: 0.5rem;
  border-radius: 999px;
  background: ${p => p.$active ? '#f97316' : '#3f3f46'};
  transition: width 0.2s, background-color 0.2s;
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`

const Spacer = styled.div`
  flex: 1;
`

const Button = styled.button<{ $primary?: boolean }>`
  border: none;
  border-radius: 0.375rem;
  padding: 0.625rem 1rem;
  color: ${p => p.$primary ? '#111111' : '#a3a3a3'};
  background: ${p => p.$primary ? '#f97316' : 'transparent'};
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: background-color 0.2s, color 0.2s;

  &:hover {
    color: ${p => p.$primary ? '#111111' : '#e5e5e5'};
    background: ${p => p.$primary ? '#ea580c' : 'rgba(255, 255, 255, 0.08)'};
  }
`

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true'
  } catch {
    return false
  }
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  const complete = () => {
    try {
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
    } catch {
      // The app remains usable even when browser storage is unavailable.
    }
    onComplete()
  }

  return (
    <Overlay role="dialog" aria-modal="true" aria-labelledby="onboarding-title" data-testid="onboarding">
      <Dialog>
        <Eyebrow>{step.eyebrow}</Eyebrow>
        <Title id="onboarding-title">{step.title}</Title>
        <Description>{step.description}</Description>
        <Progress aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
          {steps.map((_, index) => <ProgressDot key={index} $active={index === stepIndex} />)}
        </Progress>
        <Actions>
          <Button onClick={complete} data-testid="onboarding-skip-button">Skip</Button>
          <Spacer />
          {stepIndex > 0 && <Button onClick={() => setStepIndex(stepIndex - 1)}>Back</Button>}
          <Button
            $primary
            onClick={isLastStep ? complete : () => setStepIndex(stepIndex + 1)}
            data-testid="onboarding-next-button"
          >
            {isLastStep ? 'Get started' : 'Next'}
          </Button>
        </Actions>
      </Dialog>
    </Overlay>
  )
}
