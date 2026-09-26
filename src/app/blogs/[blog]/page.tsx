import RecentPostCard from '@/components/cards/RecentPostCard';
import Comment from '@/components/Comment';
import Hero from '@/components/Hero';
import Title from '@/components/Title';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TextBadge } from '@/components/ui/text-badge';
import { Textarea } from '@/components/ui/textarea';
import { getCategories, getSingleBlog, getSingleUser } from '@/lib/mockData/mockApi';
import { blogs } from '@/lib/mockData/mockData';
import { formateDate } from '@/lib/utils';
import {
  Calendar,
  CheckCircle,
  Facebook,
  Instagram,
  Linkedin,
  MessageCircle,
  MessageCircleHeart,
  Quote,
  Search,
  UserRound,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default async function page({ params }: { params: Promise<{ blog: string }> }) {
  const { author, content, comments, createdAt, image, keyPoints, quote, tags, title } =
    getSingleBlog((await params).blog);

  const categories = getCategories();
  const formattedDate = formateDate(createdAt);
  const user = getSingleUser(author)!;
  const socialShareLinks = [
    {
      name: 'facebook',
      link: 'www.facebook.com',
    },
    {
      name: 'instagram',
      link: 'www.instagram.com',
    },
    {
      name: 'linkedin',
      link: 'www.linkedin.com',
    },
    {
      name: 'pinterest',
      link: 'www.pinterest.com',
    },
  ];

  return (
    <>
      <Hero pageName={title} />
      <section className='container mx-auto flex flex-col gap-12 px-4 py-12 lg:flex-row lg:py-20'>
        {/* Blog details */}
        <div className='flex-1'>
          <Image src={image} width={770} height={370} alt={title} className='w-full rounded-xl' />
          <div className='my-6 flex flex-col pt-1 md:flex-row md:items-center md:gap-8'>
            <div className='flex items-center gap-2'>
              <UserRound />
              <span>{user.name}</span>
            </div>
            <div className='flex items-center gap-2'>
              <Calendar />
              <span>{formattedDate}</span>
            </div>
            <div className='flex items-center gap-2'>
              <MessageCircle />
              <span>{comments.length} comments</span>
            </div>
          </div>
          <p className='text-justify'>{content}</p>
          <div className='border-l-primary bg-primary/5 relative mt-8 border-l-8 px-6 py-12 text-center'>
            <Title h={4} className='max-w-3/4'>
              &quot;{quote}&quot;
            </Title>
            <Quote size={60} className='fill-foreground absolute top-4 right-4 opacity-30' />
          </div>
          <div className='mt-6'>
            <Title h={4}>Key takeaways</Title>
            <ul className='mt-4 space-y-4'>
              {keyPoints.map((point, idx) => (
                <li key={idx} className='flex items-center gap-2 text-lg font-medium'>
                  <CheckCircle className='text-primary' size={20} />
                  <p>{point}</p>
                </li>
              ))}
            </ul>
          </div>
          {/* tags and social share */}
          <div className='border-y-primary/40 mt-12 flex flex-col items-center justify-between gap-4 border-y py-6 lg:flex-row'>
            <div className='flex flex-col items-center gap-2 md:flex-row'>
              <Title h={5}>Tags :</Title>
              <div className='flex flex-col items-center gap-2 md:flex-row'>
                {tags.map((tag, idx) => (
                  <TextBadge key={idx}>{tag}</TextBadge>
                ))}
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <Title h={5}>Social Share :</Title>
              <ul className='flex items-center gap-2'>
                {socialShareLinks.map(({ name, link }) => (
                  <Link key={link} href={`https://${link}`} target='_blank'>
                    {name === 'facebook' ? (
                      <Facebook />
                    ) : name === 'instagram' ? (
                      <Instagram />
                    ) : name === 'linkedin' ? (
                      <Linkedin />
                    ) : name === 'pinterest' ? (
                      <MessageCircleHeart />
                    ) : (
                      ''
                    )}
                  </Link>
                ))}
              </ul>
            </div>
          </div>
          <div className='mt-8'>
            <div>
              <Title h={3}>Leave A Reply</Title>
              <p>Your email address will not be published. Required fields are marked *</p>
            </div>
            <form className='mt-6 space-y-6'>
              <div className='grid grid-cols-2 gap-4'>
                <Input
                  placeholder='Enter your name'
                  className='bg-primary/10 border-accent h-[50px] rounded-xl border'
                />
                <Input
                  placeholder='Enter your email'
                  className='bg-primary/10 border-accent h-[50px] rounded-xl border'
                />
              </div>
              <Textarea
                placeholder='Type your message here.'
                className='bg-primary/10 border-accent h-50 rounded-xl border'
              />
              <Button type='submit' size={'lg'}>
                Post a comment
              </Button>
            </form>
          </div>
        </div>
        {/* Side bar */}
        <aside className='md:w-[300px]'>
          <div className='relative'>
            <input
              type='text'
              placeholder='Search courses...'
              className='focus:border-primary focus:ring-primary h-10 w-full rounded-md border border-gray-300 pl-8 text-sm focus:ring-2 focus:outline-none'
            />
            <Button
              size={'icon'}
              variant={'ghost'}
              className='hover:text-primary absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400 hover:bg-transparent'
            >
              <Search />
            </Button>
          </div>
          <div className='mt-4 h-fit rounded-xl p-4 shadow-2xl'>
            <Title h={3}>Categories</Title>
            <span className='bg-primary block h-1 w-5 rounded-2xl'></span>
            <div className='mt-4 space-y-4'>
              {categories.map((category, idx) => (
                <div className='flex items-center gap-3' key={idx}>
                  <Checkbox id={category} className='cursor-pointer shadow' />
                  <Label htmlFor={category} className='cursor-pointer'>
                    {category}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <div className='mt-4 h-fit rounded-xl p-4 shadow-2xl'>
            <Title h={3}>Recent Post</Title>
            <span className='bg-primary block h-1 w-5 rounded-2xl'></span>
            <div className='mt-4 space-y-6'>
              {blogs.slice(0, 4).map((blog) => (
                <RecentPostCard key={blog._id} blog={blog} />
              ))}
            </div>
          </div>
          <div className='mt-4 h-fit rounded-xl p-4 shadow-2xl'>
            <Title h={3}>Recent Comments</Title>
            <span className='bg-primary block h-1 w-5 rounded-2xl'></span>
            <div className='mt-4 space-y-6'>
              {comments.slice(0, 3).map((comment, idx) => (
                <Comment key={idx} comment={comment} />
              ))}
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}
