import {
  FrameButton,
  FrameContainer,
  FrameImage,
  FrameInput,
  FrameReducer,
  NextServerPageProps,
  getFrameMessage,
  getPreviousFrame,
  useFramesReducer,
	PreviousFrame
} from "frames.js/next/server";
import Link from "next/link";
import {kv} from "@vercel/kv";
import { DEFAULT_DEBUGGER_HUB_URL, createDebugUrl } from "./debug";
import { currentURL } from "./utils";

type State = {
	id: string,
	happy: number,
	unhappy: number,
	neutral: number
};

const HAPPY = 1;
const NEUTRAL= 2;
const UNHAPPY = 3;


// const initialState = { active: "1", total_button_presses: 0 };
// const initialState = { id: "here"};

// 1. Get verified addresses with fid
// 2. Get weight for the configured token
// 3. Then apply the same incrementing rules
// const votingPowerReducer: FrameReducer<State> = async (state, action) => {
// 	const resp = await reducer(state, action, 1)
// 	return resp
// }

const singleVoteReducer: FrameReducer<State> = async (state, action) => {
	const resp = await reducer(state, action, 1)
	return resp
}


const reducer = async (state: State, action: PreviousFrame, voteWeight: number) => {
	console.log(action)
	console.log(state)
	// From the FID get weight
	// console.log(action?.postBody?.untrustedData?.castId)
	const voted = await kv.hget(`poll:${state.id}:${action.postBody?.untrustedData?.fid}`, "vote");
	
	// 1. check address has voted 
	// 2. if the address has voted then decrement the previous vote
	// 3. increment the new vote and overwrite the vote
	const pressedBtn = action.postBody?.untrustedData.buttonIndex;
	let happy = Number(state.happy)
	let neutral = Number(state.neutral)
	let unhappy = Number(state.unhappy)
	let votePref = voted

	if (voted) {
	  if (voted === HAPPY) {
	  	happy = happy  - voteWeight
	  } else if (voted === NEUTRAL) {
	  	neutral = neutral  - voteWeight
	  } else if (pressedBtn === UNHAPPY) {
	  	unhappy = unhappy - voteWeight
	  	votePref = 3
	  }
	}


	if (pressedBtn === HAPPY) {
		happy = happy  + voteWeight
		votePref = 1
	} else if (pressedBtn === NEUTRAL) {
		neutral = neutral  + voteWeight
		votePref = 2
	} else if (pressedBtn === UNHAPPY) {
		unhappy = unhappy + voteWeight
		votePref = 3
	}

	if (!voted) {
		await kv.hset(`poll:${state.id}:${action.postBody?.untrustedData?.fid}`, {vote: votePref});
	}


	console.log({id: state.id, happy, neutral, unhappy})
	console.log(pressedBtn)
	await kv.hset(`poll:${state.id}`, {id: state.id, happy, neutral, unhappy});
  return {
		id: state.id,
    happy:  happy,
    neutral:  neutral,
    unhappy:  unhappy,
  };
};

	// ID will be snapshot proposal id
const getOrCreatePoll = async (id: string) => {
	const exists = await kv.hget(`poll:${id}`, "id");
	console.log("Exitsts")
	if (!exists) {
		const defaultValues = {id: id, happy: 0, unhappy: 0, neutral: 0}
		console.log(id, defaultValues)
	  await kv.hset(`poll:${id}`, defaultValues);
		return defaultValues
	}
	// Can be optimized
	const happy = await kv.hget(`poll:${id}`, "happy") as number;
	const unhappy = await kv.hget(`poll:${id}`, "unhappy") as number;
	const neutral = await kv.hget(`poll:${id}`, "neutral") as number;
	return {id, happy: Number(happy), unhappy: Number(unhappy), neutral: Number(neutral)}
  
}

// This is a react server component only
// 1. Add gating
// 2. If gating configured use similar logic to multi reducer
// and conditionally display message at the bottom
export default async function Home({ searchParams }: NextServerPageProps) {
	const defaultProposalId = searchParams?.id as string;
  const url = currentURL("/");
  const previousFrame = getPreviousFrame<State>(searchParams);
	// console.log(previousFrame)

  const frameMessage = await getFrameMessage(previousFrame.postBody, {
    hubHttpUrl: DEFAULT_DEBUGGER_HUB_URL,
  });

  if (frameMessage && !frameMessage?.isValid) {
    throw new Error("Invalid frame payload");
  }
	console.log(searchParams)
	console.log(defaultProposalId)
	const initialState = await getOrCreatePoll(defaultProposalId || previousFrame?.prevState?.id)
	console.log("initialState")
	console.log(initialState)

	// get/create poll

  const [state, dispatch] = useFramesReducer<State>(
    singleVoteReducer as FrameReducer<State>,
    initialState,
    previousFrame
  );
	const awaitedState = await state

	// create poll if doesn't exist
	// https://docs.farcaster.xyz/reference/hubble/httpapi/verification

  // Here: do a server side side effect either sync or async (using await), such as minting an NFT if you want.
  // example: load the users credentials & check they have an NFT

  // console.log("info: state is:", state);

	// 3 buttons	Happy neutral unhappy
	// Store in vercel kv
	// Allow for setting that cn token gate from
	// User posts url with the frame
	//	- So on cast the poll should be created on cast
	//
	//
  // then, when done, return next frame
  return (
    <div className="p-4">
      frames.js starter kit. The Template Frame is on this page, it&apos;s in
      the html meta tags (inspect source).{" "}
      <Link href={createDebugUrl(url)} className="underline">
        Debug
      </Link>{" "}
      or see{" "}
      <Link href="/examples" className="underline">
        other examples
      </Link>
      <FrameContainer
        postUrl="/frames"
        pathname="/"
        state={awaitedState}
        previousFrame={previousFrame}
      >
        {/* <FrameImage src="https://framesjs.org/og.png" /> */}
        <FrameImage aspectRatio="1.91:1">
          <div tw="w-full h-full bg-slate-700 text-white justify-center items-center flex flex-col">
            <div tw="flex flex-row">
              {frameMessage?.inputText ? frameMessage.inputText : "Hello world"}
            </div>
            {frameMessage && (
              <div tw="flex flex-col">
                <div tw="flex">
                  Requester is @{frameMessage.requesterUserData?.username}{" "}
                </div>
                <div tw="flex">
                  Requester follows caster:{" "}
                  {frameMessage.requesterFollowsCaster ? "true" : "false"}
                </div>
                <div tw="flex">
                  Caster follows requester:{" "}
                  {frameMessage.casterFollowsRequester ? "true" : "false"}
                </div>
                <div tw="flex">
                  Requester liked cast:{" "}
                  {frameMessage.likedCast ? "true" : "false"}
                </div>
                <div tw="flex">
                  Requester recasted cast:{" "}
                  {frameMessage.recastedCast ? "true" : "false"}
                </div>
              </div>
            )}
          </div>
        </FrameImage>
        <FrameButton>
          Happy
        </FrameButton>
        <FrameButton>
          Neutral
        </FrameButton>
        <FrameButton>
          Unhappy
        </FrameButton>
      </FrameContainer>
    </div>
  );
}
