import { Province, ProfileType, TeamSize } from '@prisma/client'

import {
  ProfessionalCard,
  type ProfessionalCardData,
} from '@/components/profesionales/ProfessionalCard'
import { ProfessionalCardSkeleton } from '@/components/profesionales/ProfessionalCardSkeleton'

const persona: ProfessionalCardData = {
  id: 'preview-persona',
  slug: 'ana-perez',
  type: ProfileType.PERSON,
  name: 'Ana Pérez',
  tradeName: null,
  logoUrl: null,
  teamSize: null,
  shortBio:
    'Instalaciones eléctricas, tableros y reparaciones urgentes en el día. Trabajo con materiales de primera marca y garantía escrita.',
  licenseNumber: null,
  companyVerified: false,
  heartsCount: 24,
  image: {
    url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    width: 1200,
    height: 900,
  },
  primaryCategory: 'Electricista',
  secondaryCategory: 'Instalaciones',
  baseCity: 'San Miguel de Tucumán',
  province: Province.TUCUMAN,
  coverage: ['Yerba Buena', 'Tafí Viejo', 'Banda del Río Salí', 'Monteros'],
  coversWholeProvince: false,
}

const empresa: ProfessionalCardData = {
  id: 'preview-empresa',
  slug: 'clima-norte',
  type: ProfileType.COMPANY,
  name: 'Clima Norte',
  tradeName: 'Clima Norte',
  logoUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  teamSize: TeamSize.T6_20,
  shortBio:
    'Instalación y mantenimiento de aire acondicionado para hogares y comercios. Presupuesto sin cargo en el Gran Tucumán.',
  licenseNumber: 'MAT-123',
  companyVerified: true,
  heartsCount: 8,
  image: {
    url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    width: 1200,
    height: 900,
  },
  primaryCategory: 'Refrigeración',
  secondaryCategory: 'Electricista',
  baseCity: 'Yerba Buena',
  province: Province.TUCUMAN,
  coverage: [],
  coversWholeProvince: false,
}

export default function Page(): React.ReactElement {
  return (
    <main className="mx-auto w-full max-w-[420px] space-y-4 p-4">
      <ProfessionalCard profile={persona} logueado={false} />
      <ProfessionalCard profile={empresa} logueado />
      <ProfessionalCardSkeleton />
    </main>
  )
}
