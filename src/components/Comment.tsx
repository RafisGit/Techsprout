import { getSingleUser } from '@/lib/mockData/mockApi';
import { Avatar } from './ui/avatar';
import Image from 'next/image';
import { formateDate } from '@/lib/utils';

export default function Comment({
  comment,
}: {
  comment: { user: string; comment: string; createdAt: string };
}) {
  const { comment: message, createdAt, user } = comment;
  const formattedDate = formateDate(createdAt);
  const { image, name } = getSingleUser(user)!;

  return (
    <div className='flex items-start gap-2'>
      <Avatar>
        <Image src={image} height={30} width={30} alt={name} className='bg-foreground/5' />
      </Avatar>
      <div className='bg-foreground/5 rounded-2xl rounded-tl-none p-2'>
        <p>
          {message} <span className='block text-end text-xs font-medium'>{formattedDate}</span>
        </p>
      </div>
    </div>
  );
}
