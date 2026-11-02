import { useTranslation } from 'react-i18next'
import { ArrowUpRight, CookingPot, Package, ShoppingBasket } from 'lucide-react'
import { Button } from './ui/button'

export function WelcomeScreen({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation()

  return (
    <main className="welcome-screen">
      <div className="welcome-copy">
        <p className="page-eyebrow">{t('design.welcomeEyebrow')}</p>
        <h2>{t('design.welcomeTitle')}</h2>
        <p>{t('design.welcomeDescription')}</p>
        <Button size="lg" onClick={onSignIn}>
          {t('auth.signIn')} <ArrowUpRight aria-hidden="true" />
        </Button>
        <span className="welcome-note">{t('auth.signInRequired')}</span>
      </div>
      <ol className="welcome-journey">
        {[ShoppingBasket, Package, CookingPot].map((Icon, index) => (
          <li key={index}>
            <span className="journey-number">0{index + 1}</span>
            <Icon aria-hidden="true" />
            <div>
              <h3>{t(`workspace.welcomeStep${index + 1}`)}</h3>
              <p>{t(`workspace.welcomeStep${index + 1}Hint`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  )
}
