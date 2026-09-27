import { Card, CardContent, CardHeader } from '@/components/ui/card';
import Image from 'next/image';
import Title from '../Title';
import { FacebookIcon, InstagramIcon, LinkedinIcon, Share2, TwitterIcon } from 'lucide-react';
import { User } from '@/lib/mockData/mockDataTypes';

export default function InstructorCard({ instructor, order }: { instructor: User; order: number }) {
  const { image, name, bio, socialLinks } = instructor;
  return (
    <Card className='gap-2 border-0 bg-transparent p-0 shadow-none'>
      <CardHeader className='relative z-20 flex justify-center p-0'>
        <Image src={image} alt={name} width={280} height={280} />
        {order % 2 !== 0 ? (
          <span className='bg-accent/20 absolute bottom-0 -z-10 h-[70%] w-full rounded-tl-[50%]'></span>
        ) : (
          <span className='bg-primary/20 absolute bottom-0 -z-10 h-[70%] w-full rounded-tl-[50%] rounded-r-[50%]'></span>
        )}
      </CardHeader>
      <CardContent className='flex items-center justify-between gap-4 p-0'>
        <div>
          <p className='text-foreground/70 text-base font-medium'>{bio}</p>
          <Title h={3}>{name}</Title>
        </div>
        <div className='bg-primary/70 group hover:bg-accent relative rounded-full p-2 text-white'>
          <Share2 className='cursor-pointer' />
          <div className='absolute bottom-12 left-0 z-20 flex flex-col gap-0 opacity-0 duration-300 group-hover:gap-2 group-hover:opacity-100'>
            {socialLinks.map((link, idx) => (
              <a key={idx} href={`https://${link}`} target='_blank' rel='noopener noreferrer'>
                <div className='bg-primary/70 hover:bg-accent/80 rounded-full p-2 duration-300'>
                  {idx === 0 ? (
                    <FacebookIcon />
                  ) : idx === 1 ? (
                    <TwitterIcon />
                  ) : idx === 2 ? (
                    <InstagramIcon />
                  ) : (
                    <LinkedinIcon />
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
