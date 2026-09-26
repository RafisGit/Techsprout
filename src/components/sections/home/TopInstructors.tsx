import AnimatedText from '@/components/AnimatedText';
import InstructorCard from '@/components/cards/InstructorCard';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { TextBadge } from '@/components/ui/text-badge';
// import { instructors } from '@/lib/dummy-data';
import { getTopInstructor } from '@/lib/mockData/mockApi';

const instructors = getTopInstructor();

export default function TopInstructors() {
  return (
    <section className='bg-white pt-[120px] pb-[180px]'>
      <div className='common-container'>
        <div className='flex flex-col items-center justify-between gap-8 md:flex-row'>
          <div className='space-y-4'>
            <TextBadge>Our Qualified People Matter</TextBadge>
            <Title h={2}>
              Top <AnimatedText text='Class' /> Instructors
            </Title>
          </div>
          <div>
            <Button variant={'outline'} size={'lg'} isArrow={true} className='hover:border-accent'>
              All Instructors
            </Button>
          </div>
        </div>
        <div className='mt-8 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4'>
          {instructors.map((instructor, idx) => (
            <InstructorCard key={instructor._id} instructor={instructor} order={idx + 1} />
          ))}
        </div>
      </div>
    </section>
  );
}
