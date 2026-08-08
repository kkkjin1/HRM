import DailyMessage from '@/components/DailyMessage'
import MenuVote from '@/components/MenuVote'
import Roulette from '@/components/Roulette'
import DoodleBoard from '@/components/DoodleBoard'

export default function FunHomePage() {
  return (
    <div className="max-w-[1200px] space-y-5">
      <DailyMessage />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MenuVote />
        <div id="fun-roulette">
          <Roulette />
        </div>
      </div>
      <DoodleBoard />
    </div>
  )
}
