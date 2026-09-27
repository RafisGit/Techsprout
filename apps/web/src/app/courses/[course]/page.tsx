import AnimatedText from '@/components/AnimatedText';
import { CourseCard } from '@/components/cards/CourseCard';
import ReviewCard from '@/components/cards/ReviewCard';
import Title from '@/components/Title';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TextBadge } from '@/components/ui/text-badge';
import { getCourseReviews, getSingleCourse, getSingleUser } from '@/lib/mockData/mockApi';
import { courses } from '@/lib/mockData/mockData';
import { CheckCircle, Clock, FileText, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default async function Course({ params }: { params: Promise<{ course: string }> }) {
  const { course } = await params;
  const {
    category,
    title,
    description,
    thumbnail,
    demoVideo,
    duration,
    enrolments,
    instructor,
    isFree,
    lessons,
    price,
    reviews,
    audience,
    keyLearningPoints,
    requirements,
    resources,
    _id,
  } = getSingleCourse(course);

  const author = getSingleUser(instructor)!;

  const courseReviews = getCourseReviews(_id);

  const tabTriggers = [
    {
      name: 'course information',
      value: 'info',
    },
    {
      name: 'demo videos',
      value: 'demo',
    },
    {
      name: 'reviews',
      value: 'review',
    },
  ];

  return (
    <section className='py-16'>
      {/* course title */}
      <div className='bg-accent py-20'>
        <div className='container mx-auto space-y-4 px-4 text-white'>
          <TextBadge className='bg-primary rounded-full text-white'>{category}</TextBadge>
          <Title h={2} className='text-white'>
            {title}
          </Title>
          <div className='flex flex-col gap-4 md:flex-row md:items-center'>
            <div className='flex items-center gap-1'>
              <Avatar className='h-10 w-10 bg-white'>
                <Image src={author?.image} width={80} alt={author?.name} height={80} />
              </Avatar>
              <p>{author.name}</p>
            </div>
            <div className='flex items-center gap-1'>
              <FileText width={20} />
              <span>{lessons?.length} lesson</span>
            </div>
            <div className='flex items-center gap-1'>
              <Clock width={20} />
              <span>{duration}</span>
            </div>
            <div className='flex items-center gap-1'>
              <Users width={20} />
              <span>{enrolments?.length} students</span>
            </div>
            <div className='flex items-center'>
              {Array.from({ length: 5 }).map((_, idx) => (
                <svg
                  key={idx}
                  viewBox='0 0 24 24'
                  fill='none'
                  xmlns='http://www.w3.org/2000/svg'
                  stroke='#fff700'
                  width={20}
                >
                  <g id='SVGRepo_bgCarrier' strokeWidth='0'></g>
                  <g id='SVGRepo_tracerCarrier' strokeLinecap='round' strokeLinejoin='round'></g>
                  <g id='SVGRepo_iconCarrier'>
                    <path
                      d='M9.15316 5.40838C10.4198 3.13613 11.0531 2 12 2C12.9469 2 13.5802 3.13612 14.8468 5.40837L15.1745 5.99623C15.5345 6.64193 15.7144 6.96479 15.9951 7.17781C16.2757 7.39083 16.6251 7.4699 17.3241 7.62805L17.9605 7.77203C20.4201 8.32856 21.65 8.60682 21.9426 9.54773C22.2352 10.4886 21.3968 11.4691 19.7199 13.4299L19.2861 13.9372C18.8096 14.4944 18.5713 14.773 18.4641 15.1177C18.357 15.4624 18.393 15.8341 18.465 16.5776L18.5306 17.2544C18.7841 19.8706 18.9109 21.1787 18.1449 21.7602C17.3788 22.3417 16.2273 21.8115 13.9243 20.7512L13.3285 20.4768C12.6741 20.1755 12.3469 20.0248 12 20.0248C11.6531 20.0248 11.3259 20.1755 10.6715 20.4768L10.0757 20.7512C7.77268 21.8115 6.62118 22.3417 5.85515 21.7602C5.08912 21.1787 5.21588 19.8706 5.4694 17.2544L5.53498 16.5776C5.60703 15.8341 5.64305 15.4624 5.53586 15.1177C5.42868 14.773 5.19043 14.4944 4.71392 13.9372L4.2801 13.4299C2.60325 11.4691 1.76482 10.4886 2.05742 9.54773C2.35002 8.60682 3.57986 8.32856 6.03954 7.77203L6.67589 7.62805C7.37485 7.4699 7.72433 7.39083 8.00494 7.17781C8.28555 6.96479 8.46553 6.64194 8.82547 5.99623L9.15316 5.40838Z'
                      fill='#fff700'
                    ></path>
                  </g>
                </svg>
              ))}
              <span className='ms-2 mt-1 block'>({reviews?.length})</span>
            </div>
          </div>
        </div>
      </div>
      <section className='container mx-auto mt-12 flex flex-col gap-4 px-4 lg:flex-row'>
        {/* course details */}
        <div className='flex-1'>
          <Image src={thumbnail} width={870} height={570} alt={title} className='w-full' />
          <div>
            <Tabs defaultValue='info' className='mt-4 w-full'>
              <TabsList className='mb-4 grid h-auto w-full grid-cols-3 rounded-none border-b border-gray-200 bg-transparent p-0'>
                {tabTriggers.map((trigger) => (
                  <TabsTrigger
                    key={trigger.value}
                    value={trigger.value}
                    className='data-[state=active]:border-primary data-[state=active]:text-primary relative rounded-none px-4 py-3 text-base font-medium text-gray-600 capitalize data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none'
                  >
                    {trigger.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value='info'>
                <p className='text-lg'>{description}</p>
                <div className='mt-6 space-y-4'>
                  <Title h={3} className='border-b-2 pb-2'>
                    What Will You Learn?
                  </Title>
                  <ul className='space-y-4'>
                    {keyLearningPoints.map((point, idx) => (
                      <li key={idx} className='flex items-center gap-2 text-lg font-medium'>
                        <CheckCircle className='text-primary' size={20} />
                        <p>{point}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>
              <TabsContent value='demo'>
                <video src={demoVideo} controls={true} className='w-full'></video>
              </TabsContent>
              <TabsContent value='review' className='grid grid-cols-2 gap-4'>
                {courseReviews.slice(0, 4).map((review) => (
                  <ReviewCard key={review._id} review={review} />
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>
        {/* Sidebar */}
        <aside className='lg:-mt-60'>
          {/* Enrolment */}
          <div className='rounded-2xl border bg-white shadow'>
            <div className='p-6 text-center'>
              <div>{isFree ? <Title h={3}>Free</Title> : <Title h={3}>${price}</Title>}</div>
              <div className='mt-2 space-y-2'>
                <Button size={'lg'}>Enroll Now</Button>
                {isFree ? <p>Free access this course</p> : <p>Pay {price} to access this course</p>}
              </div>
            </div>
            <div className='space-y-4 border-t-2 p-6'>
              <div className='flex items-center gap-1'>
                <FileText width={20} />
                <span>{lessons?.length} lesson includes</span>
              </div>
              <div className='flex items-center gap-1'>
                <Users width={20} />
                <span>{enrolments?.length} students total enrolled</span>
              </div>
              <div className='flex items-center gap-1'>
                <Clock width={20} />
                <span>{duration} hours duration</span>
              </div>
            </div>
          </div>
          {/* Audience, Requirements,Resources  */}
          <div className='rounded-2xl border bg-white shadow lg:mt-6 lg:max-w-[260px]'>
            <div className='border-b p-6'>
              <Title h={5}>A course by</Title>
              <div className='mt-2 flex items-center gap-1'>
                <Avatar className='bg-primary/20 h-10 w-10'>
                  <Image src={author?.image} width={80} alt={author?.name} height={80} />
                </Avatar>
                <Title h={4}>{author.name}</Title>
              </div>
            </div>
            <div className='space-y-4 p-6'>
              <div>
                <Title h={5}>Audience</Title>
                <ul className='mt-2 space-y-2'>
                  {audience.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
              <div>
                <Title h={5}>Recourses</Title>
                <ul className='mt-2 space-y-2'>
                  {resources.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
              <div>
                <Title h={5}>Requirements</Title>
                <ul className='mt-2 space-y-2'>
                  {requirements.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </aside>
      </section>
      {/* Top courses */}
      <section className='container mx-auto px-4'>
        <div className='mt-20 flex flex-col items-center justify-between gap-12 text-center md:flex-row md:text-left'>
          <div className='space-y-4'>
            <TextBadge>Top</TextBadge>
            <Title h={2}>
              More courses by <AnimatedText text='TechSprout School' />
            </Title>
          </div>
          <div>
            <Link href={'/courses'}>
              <Button size={'lg'} isArrow={true}>
                View all courses
              </Button>
            </Link>
          </div>
        </div>
        <div className='mt-16 grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3'>
          {courses.slice(0, 3).map((course) => (
            <CourseCard key={course._id} course={course} />
          ))}
        </div>
      </section>
    </section>
  );
}
