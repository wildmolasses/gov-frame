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
  PreviousFrame,
} from "frames.js/next/server";
import Link from "next/link";
import { kv } from "@vercel/kv";
import { DEFAULT_DEBUGGER_HUB_URL, createDebugUrl } from "./debug";
import { currentURL } from "./utils";
import { gql, ApolloQueryResult } from "@apollo/client";
import createApolloClient from "./apollo-client";
import { Proposal, Vp, User } from "./gql/graphql";

type State = {
  id: string;
  h: number;
  u: number;
  n: number;
  voter: string;
  voteChoice: number;
};

function nFormatter(num, digits) {
  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    { value: 1e18, symbol: "E" },
  ];
  const regexp = /\.0+$|(?<=\.[0-9]*[1-9])0+$/;
  const item = lookup.findLast((item) => num >= item.value);
  return item
    ? (num / item.value).toFixed(digits).replace(regexp, "").concat(item.symbol)
    : "0";
}

const HAPPY = 1;
const NEUTRAL = 2;
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
  const resp = await reducer(state, action, 1);
  return resp;
};

const reducer = async (
  state: State,
  action: PreviousFrame,
  voteWeight: number
) => {
  console.log(action);
  console.log(state);
  // From the FID get weight
  // console.log(action?.postBody?.untrustedData?.castId)
  const voted = await kv.hget(
    `poll:${state.id}:${action.postBody?.untrustedData?.fid}`,
    "vote"
  );

  // 1. check address has voted
  // 2. if the address has voted then decrement the previous vote
  // 3. increment the new vote and overwrite the vote
  const pressedBtn = action.postBody?.untrustedData.buttonIndex;
  let happy = Number(state.h);
  let neutral = Number(state.n);
  let unhappy = Number(state.u);
  let votePref = voted;

  if (voted) {
    if (voted === HAPPY) {
      happy = happy - voteWeight;
    } else if (voted === NEUTRAL) {
      neutral = neutral - voteWeight;
    } else if (pressedBtn === UNHAPPY) {
      unhappy = unhappy - voteWeight;
      votePref = 3;
    }
  }

  if (pressedBtn === HAPPY) {
    happy = happy + voteWeight;
    votePref = 1;
  } else if (pressedBtn === NEUTRAL) {
    neutral = neutral + voteWeight;
    votePref = 2;
  } else if (pressedBtn === UNHAPPY) {
    unhappy = unhappy + voteWeight;
    votePref = 3;
  }

  if (!voted) {
    await kv.hset(`poll:${state.id}:${action.postBody?.untrustedData?.fid}`, {
      vote: votePref,
    });
  }

  console.log({ id: state.id, happy, neutral, unhappy });
  console.log(pressedBtn);
  await kv.hset(`poll:${state.id}`, { id: state.id, happy, neutral, unhappy });
  return {
    id: state.id,
    h: happy,
    n: neutral,
    u: unhappy,
    voter: state.voter,
    voteChoice: state.voteChoice,
  };
};

const createQuery = ({ proposalId }: { proposalId: string }) =>
  gql(/* GraphQL */ `
  query {
    proposal(
      id: "${proposalId}"
    ) {
      id
      title
      body
      choices
      start
      end
      snapshot
      state
      author
      created
      scores
      scores_by_strategy
      scores_total
      scores_updated
      plugins
      network
      strategies {
        name
        network
        params
      }
      space {
        id
        name
        avatar
      }
      link
    }
  }
`);

const createVpQuery = ({
  proposalId,
  voter,
  space,
}: {
  proposalId: string;
  voter: string;
  space: string;
}) => {
  return gql(/* GraphQL */ `
        query {vp(
    proposal:"${proposalId}",
    voter: "${voter}",
    space:"${space}"
  ) {
    vp
    vp_by_strategy
    vp_state
  }
  }`);
};

const createUserQuery = ({ voter }: { voter: string }) => {
  return gql(/* GraphQL */ `
        query {
        user(id: "${voter}") {
      name
      about
      avatar
      created
    }
  }
`);
};
// ID will be snapshot proposal id
const getOrCreatePoll = async (
  id: string,
  voter: string,
  voteChoice: number
) => {
  const exists = await kv.hget(`poll:${id}`, "id");
  console.log("Exitsts");
  if (!exists) {
    const defaultValues = { id: id, happy: 0, unhappy: 0, neutral: 0 };
    console.log(id, defaultValues);
    await kv.hset(`poll:${id}`, defaultValues);
    return defaultValues;
  }
  // Can be optimized
  const happy = (await kv.hget(`poll:${id}`, "happy")) as number;
  const unhappy = (await kv.hget(`poll:${id}`, "unhappy")) as number;
  const neutral = (await kv.hget(`poll:${id}`, "neutral")) as number;
  return {
    id,
    h: Number(happy),
    u: Number(unhappy),
    n: Number(neutral),
    voter,
    voteChoice,
  };
};

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

  const { id: proposalId, voter, voteChoice } = searchParams;
  console.log(searchParams);
  console.log(defaultProposalId);
  const initialState = await getOrCreatePoll(
    defaultProposalId || previousFrame?.prevState?.id,
    voter || previousFrame?.prevState?.voter,
    voteChoice || previousFrame?.prevState?.voteChoice
  );
  console.log("initialState");
  console.log(initialState);

  // get/create poll

  // eslint-disable-next-line
  const [state, dispatch] = useFramesReducer<State>(
    singleVoteReducer as FrameReducer<State>,
    initialState,
    previousFrame
  );
  const awaitedState = await state;

  // create poll if doesn't exist
  // https://docs.farcaster.xyz/reference/hubble/httpapi/verification

  const {
    proposal,
    vp,
    // user
  } = await getProposalAndVp({ proposalId, voter });

  // Here: do a server side side effect either sync or async (using await), such as minting an NFT if you want.
  // example: load the users credentials & check they have an NFT
  // console.log(proposal);
  // console.log("info: state is:", state);

  const maybeIpfsUrl = (url: string) => {
    if (url.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${url.replace("ipfs://", "")}`;
    }
    return url;
  };

  const orgAvatar = proposal.space?.avatar
    ? maybeIpfsUrl(proposal.space.avatar)
    : undefined;

  const userAvatar = undefined;
  // user.avatar ? maybeIpfsUrl(user.avatar) : undefined;
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
          <div tw="w-full h-full bg-slate-800 text-white justify-center flex flex-col">
            <div tw="flex flex-row bg-slate-700 p-3 items-center">
              <div tw="flex flex-row">
                {orgAvatar && (
                  <img tw="w-12 h-12 rounded-full mr-3" src={orgAvatar} />
                )}
              </div>
              <div tw="flex grow-1">{proposal.space?.name}</div>
              <div tw="flex text-gray-400 text-[26px]">Snapshot vote</div>
            </div>
            <div tw="flex flex-col items-center grow-1">
              <div tw="flex flex-row">Proposal: {proposal.title}</div>
              <div tw="flex flex-col justify-center grow-1">
                <div tw="flex flex-col bg-slate-600 text-[28px]">
                  <div tw="flex flex-col">
                    <div tw="flex bg-slate-900">Delegate:</div>
                    <div tw="flex p-2">{voter}</div>
                  </div>
                  {/* <div tw="flex">
                    {userAvatar && <img src={userAvatar} tw="w-20 h-20" />}
                  </div> */}
                  <div tw="flex flex-col">
                    <div tw="flex bg-slate-900">Signaling:</div>
                    <div tw="flex p-2">{proposal.choices[voteChoice]}</div>
                  </div>
                  <div tw="flex flex-col">
                    <div tw="flex bg-slate-900">My voting power:</div>
                    <div tw="flex p-2">{nFormatter(vp.vp!, 2)}</div>
                  </div>
                </div>
              </div>

              <div tw="flex flex-row text-[30px]">Current results:</div>

              <div id="choice container" tw="flex flex-col w-3/5 mb-2">
                {/* Each choice gets its own row */}
                {proposal.choices.map((choice, i) => {
                  const score =
                    (((proposal.scores![i] as number) || 0) /
                      proposal.scores_total!) *
                    100;
                  return (
                    <div
                      tw="flex flex-row items-center w-full text-[26px] justify-between"
                      key={choice}
                    >
                      <div tw="flex flex-row grow-1">{choice}</div>
                      <div tw="flex w-[200px] h-[10px] bg-gray-700">
                        <div
                          tw={`flex flex-row bg-gray-200 w-[${Math.floor(
                            score
                          )}%]`}
                        ></div>
                      </div>
                      <div tw={`flex flex-row w-[40px] ml-2`}>
                        {score.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* <div tw="flex flex-row">
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
            )} */}
          </div>
        </FrameImage>
        <FrameButton action="link" target={proposal.link as string}>
          View on Snapshot
        </FrameButton>
        <FrameButton>Agree</FrameButton>
        <FrameButton>Neutral</FrameButton>
        <FrameButton>Disagree</FrameButton>
      </FrameContainer>
    </div>
  );
}

async function getProposalAndVp({
  proposalId,
  voter,
}: {
  proposalId: string;
  voter: string;
}) {
  const client = createApolloClient();
  const { data } = (await client.query({
    query: createQuery({ proposalId }),
  })) as ApolloQueryResult<{ proposal: Proposal }>;
  const { data: vpData } = (await client.query({
    query: createVpQuery({
      proposalId,
      voter,
      space: data.proposal!.space!.id,
    }),
  })) as ApolloQueryResult<{ vp: Vp }>;
  const { data: userData } = (await client.query({
    query: createUserQuery({ voter }),
  })) as ApolloQueryResult<{ user: User }>;
  return {
    proposal: data.proposal,
    vp: vpData.vp,
    // user: userData.user,
  };
}
