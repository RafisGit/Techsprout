import Hero from '@/components/Hero';
import Title from '@/components/Title';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { faqs } from '@/lib/mockData/mockData';

export default function page() {
  return (
    <>
      <Hero pageName='FAQ' />
      <section className='mx-auto my-8 px-4 lg:my-16 xl:max-w-2/3'>
        <Accordion type='single' collapsible className='w-full'>
          {faqs.map(({ question, answer }, idx) => (
            <AccordionItem value={idx.toString()} key={idx} className='space-y-4 border-0'>
              <AccordionTrigger className='bg-primary/5 rounded-xl p-6'>
                <Title h={5}> {question}</Title>
              </AccordionTrigger>
              <AccordionContent className='mb-2 p-2'>
                <p className='font-medium md:text-lg'>{answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </>
  );
}
